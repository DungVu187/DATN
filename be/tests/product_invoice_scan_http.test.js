const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const SCANNER_PHONE = '0975000034';
const PRODUCT_CODE_PREFIX = 'PRODUCT-INVOICE-SCAN-';
const INVOICE_DIRECTORY = path.join(__dirname, '../upload/invoices');
const VALID_WEBP = Buffer.from(
  'UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
  'base64',
);

let scannerAgent;
let originalGeminiApiKey;
const testFilePaths = new Set();

const cleanupTestData = async ({ includeUser = false } = {}) => {
  await Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } });
  if (includeUser) {
    await User.deleteMany({ phone: SCANNER_PHONE });
  }
  await Promise.all(Array.from(testFilePaths, async (filePath) => {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
  testFilePaths.clear();
};

const listGeneratedInvoiceFiles = async () => {
  try {
    return new Set((await fs.readdir(INVOICE_DIRECTORY)).filter(
      (filename) => /^invoice-scan-\d+-\d+\.webp$/.test(filename),
    ));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
};

beforeAll(async () => {
  originalGeminiApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'invoice-scan-test-key';
  await mongoose.connect(DATABASE_URL);
  await cleanupTestData({ includeUser: true });
  await User.create({
    phone: SCANNER_PHONE,
    password: 'password123',
    name: 'Invoice Scanner',
    role: 'staff',
    functions: ['order_management'],
    permissions: ['order.scan_ai'],
  });
  scannerAgent = request.agent(app);
  const loginResponse = await scannerAgent
    .post('/users/admin/login')
    .send({ phone: SCANNER_PHONE, password: 'password123' });
  expect(loginResponse.status).toBe(200);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupTestData();
});

afterAll(async () => {
  if (originalGeminiApiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = originalGeminiApiKey;
  }
  await cleanupTestData({ includeUser: true });
  await mongoose.disconnect();
});

describe('Product invoice scan HTTP integration', () => {
  it('returns the legacy success envelope with matching from the extracted service', async () => {
    const product = await Product.create({
      type: 'Relay',
      name: 'Relay RXM2AB2BD',
      code: PRODUCT_CODE_PREFIX + 'RXM2AB2BD',
      brand: 'Schneider Electric',
      section: 'Automation',
      value: 'Relay',
      warranty: '12 months',
      display: true,
      vat: '8%',
      variant: [{ price: '100000', quantityForSale: 10, quantityInStorage: 12 }],
    });
    const scannedCode = product.code;
    const geminiItems = [{
      stt: '1',
      rawScannedName: 'Relay RXM2AB2BD',
      code: scannedCode,
      brand: '',
      quantity: 2,
      price: 100000,
      unit: 'cái',
    }];
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: JSON.stringify(geminiItems) }] },
        }],
      }),
    });

    const response = await scannerAgent
      .post('/products/scan-invoice')
      .attach('invoice', VALID_WEBP, {
        filename: 'invoice.webp',
        contentType: 'image/webp',
      });
    const filename = path.posix.basename(response.body.imageUrl || '');
    if (/^invoice-scan-\d+-\d+\.webp$/.test(filename)) {
      testFilePaths.add(path.join(INVOICE_DIRECTORY, filename));
    }

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(1);
    expect(response.body.imageUrl).toMatch(
      /^\/invoice-images\/invoice-scan-\d+-\d+\.webp$/,
    );
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toEqual(expect.objectContaining({
      stt: '1',
      rawScannedName: 'Relay RXM2AB2BD',
      code: scannedCode,
      rawScannedCode: scannedCode,
      canonicalCode: scannedCode,
      normalizedCodeKey: scannedCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
      brand: '',
      brandIsNew: false,
      vat: '8%',
      matchStatus: 'MATCHED',
      matchedProductId: product._id.toString(),
      candidateProductIds: [],
      autoSelected: false,
      requiresReview: false,
      confidence: 'high',
    }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = fetchSpy.mock.calls[0];
    expect(requestUrl).toContain('/models/gemini-3.5-flash:generateContent');
    const requestBody = JSON.parse(requestOptions.body);
    expect(crypto.createHash('sha256')
      .update(requestBody.contents[0].parts[0].text, 'utf8')
      .digest('hex'))
      .toBe('c7def06eebac14da05aa46bb4c22f1a9f42879ff9c2ad26041065c46e8e40a5f');
    expect(requestBody.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'image/webp',
      data: VALID_WEBP.toString('base64'),
    });
    await expect(fs.readFile(path.join(INVOICE_DIRECTORY, filename))).resolves.toEqual(VALID_WEBP);
  });

  it('returns the legacy generic 500 envelope for backend scan failures', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Product, 'find').mockImplementationOnce(() => {
      throw new Error('invoice scan setup failed');
    });

    const response = await scannerAgent
      .post('/products/scan-invoice')
      .attach('invoice', VALID_WEBP, {
        filename: 'invoice.webp',
        contentType: 'image/webp',
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: 0,
      message: 'Đã xảy ra lỗi khi phân tích hóa đơn bằng AI: Lỗi server',
      error: 'Lỗi server',
    });
  });

  it('rolls back the stored invoice when Gemini response parsing fails', async () => {
    const filesBefore = await listGeneratedInvoiceFiles();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] }),
    });

    const response = await scannerAgent
      .post('/products/scan-invoice')
      .attach('invoice', VALID_WEBP, {
        filename: 'invoice.webp',
        contentType: 'image/webp',
      });
    const filesAfter = await listGeneratedInvoiceFiles();
    const newlyCreatedFiles = Array.from(filesAfter).filter(
      (filename) => !filesBefore.has(filename),
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: 0,
      message: 'Đã xảy ra lỗi khi phân tích hóa đơn bằng AI: Lỗi server',
      error: 'Lỗi server',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(newlyCreatedFiles).toEqual([]);
  });

  it('does not call Gemini or leave a file when persistence fails', async () => {
    const filesBefore = await listGeneratedInvoiceFiles();
    const writeError = Object.assign(new Error('forced invoice write failure'), { code: 'EIO' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(writeError);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    });

    const response = await scannerAgent
      .post('/products/scan-invoice')
      .attach('invoice', VALID_WEBP, {
        filename: 'invoice.webp',
        contentType: 'image/webp',
      });
    const filesAfter = await listGeneratedInvoiceFiles();

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: 0,
      message: 'Đã xảy ra lỗi khi phân tích hóa đơn bằng AI: Lỗi server',
      error: 'Lỗi server',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(filesAfter).toEqual(filesBefore);
  });
});
