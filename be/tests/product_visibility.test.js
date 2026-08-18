const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../components/product');
const { User } = require('../components/user');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Product.deleteMany({});
  await User.deleteMany({});
});

const createProduct = async (name, overrides = {}) => Product.create({
  type: 'Thiết bị điện',
  name,
  brand: 'Test Brand',
  section: 'Thiết bị công nghiệp',
  value: 'Thiết bị điện',
  code: `CODE-${name}`,
  warranty: '12 tháng',
  display: true,
  purchaseCount: 0,
  variant: [{
    price: '100000',
    importPrice: '70000',
    earn: 30,
    color: 'Xám',
    quantityForSale: 10,
    quantityInStorage: 10,
  }],
  ...overrides,
});

const createCustomerAgent = async ({ phone }) => {
  await User.create({
    phone,
    password: 'password123',
    name: `Customer ${phone}`,
    role: 'customer',
  });

  const agent = request.agent(app);
  const login = await agent
    .post('/users/login')
    .send({ phone, password: 'password123' });

  expect(login.status).toBe(200);
  return agent;
};

describe('Product storefront visibility', () => {
  it('cho guest xem toàn bộ sản phẩm công khai và ẩn giá nhập/lợi nhuận', async () => {
    await createProduct('Public A');
    await createProduct('Public B');
    await createProduct('Hidden', { display: false });

    const response = await request(app).get('/products').query({ limit: 100 });

    expect(response.status).toBe(200);
    expect(response.body.products.map((product) => product.name).sort()).toEqual([
      'Public A',
      'Public B',
    ]);
    response.body.products.forEach((product) => {
      expect(product.variant[0].importPrice).toBeUndefined();
      expect(product.variant[0].earn).toBeUndefined();
    });
  });

  it('cho customer xem toàn bộ sản phẩm công khai', async () => {
    await createProduct('Public A');
    await createProduct('Public B');
    await createProduct('Hidden', { display: false });
    const agent = await createCustomerAgent({ phone: '0912000001' });

    const response = await agent.get('/products').query({ limit: 100 });

    expect(response.status).toBe(200);
    expect(response.body.products.map((product) => product.name).sort()).toEqual([
      'Public A',
      'Public B',
    ]);
    expect(response.body.products[0].variant[0].importPrice).toBeUndefined();
    expect(response.body.products[0].variant[0].earn).toBeUndefined();
  });

  it('trả trạng thái liên hệ và che giá khi lợi nhuận 0, không có giá hoặc hết tồn bán', async () => {
    await createProduct('Normal Product');
    await createProduct('Zero Earn', {
      variant: [{
        price: '5480000',
        importPrice: '5480000',
        earn: 0,
        quantityForSale: 18,
        quantityInStorage: 20,
      }],
    });
    await createProduct('No Price', {
      variant: [{
        price: '',
        importPrice: '',
        earn: 25,
        quantityForSale: 18,
        quantityInStorage: 20,
      }],
    });
    await createProduct('No Stock', {
      variant: [{
        price: '100000',
        importPrice: '80000',
        earn: 25,
        quantityForSale: 0,
        quantityInStorage: 20,
      }],
    });

    const response = await request(app).get('/products').query({ limit: 100 });
    expect(response.status).toBe(200);
    const productsByName = new Map(
      response.body.products.map((product) => [product.name, product])
    );

    expect(productsByName.get('Normal Product').variant[0]).toEqual(
      expect.objectContaining({ price: '100000', contactForPrice: false })
    );
    ['Zero Earn', 'No Price', 'No Stock'].forEach((name) => {
      expect(productsByName.get(name).variant[0]).toEqual(
        expect.objectContaining({ price: '', contactForPrice: true })
      );
    });
  });

  it('giữ phạm vi sản phẩm công khai nhất quán trên mọi API đọc', async () => {
    const firstProduct = await createProduct('First Product', { purchaseCount: 3 });
    const secondProduct = await createProduct('Second Product', { purchaseCount: 2 });
    const sharedProduct = await createProduct('Shared Product', { purchaseCount: 1 });
    const outsideProduct = await createProduct('Outside Product', { purchaseCount: 100 });
    const hiddenProduct = await createProduct('Hidden Product', { display: false });
    const agent = await createCustomerAgent({ phone: '0912000002' });

    const listResponse = await agent.get('/products').query({ limit: 100 });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.products.map((product) => product.name).sort()).toEqual([
      'First Product',
      'Outside Product',
      'Second Product',
      'Shared Product',
    ]);

    const detailResponse = await agent.get(`/products/${outsideProduct._id}`);
    expect(detailResponse.status).toBe(200);

    const fetchByIdsResponse = await agent
      .post('/products/fetch-by-ids')
      .send({ ids: [firstProduct._id.toString(), outsideProduct._id.toString()] });
    expect(fetchByIdsResponse.status).toBe(200);
    expect(fetchByIdsResponse.body.products.map((product) => product.name).sort()).toEqual([
      'First Product',
      'Outside Product',
    ]);

    const byCodesResponse = await agent
      .post('/products/by-codes')
      .send({ codes: [firstProduct.code, outsideProduct.code] });
    expect(byCodesResponse.status).toBe(200);
    expect(byCodesResponse.body.products.map((product) => product.code).sort()).toEqual([
      outsideProduct.code,
      firstProduct.code,
    ].sort());

    const topPurchasedResponse = await agent.get('/products/top-purchased');
    expect(topPurchasedResponse.status).toBe(200);
    expect(topPurchasedResponse.body.map((product) => product.name)).toEqual([
      'Outside Product',
      'First Product',
      'Second Product',
      'Shared Product',
    ]);
  });

  it('không hạ cookie lỗi xuống quyền guest', async () => {
    await createProduct('Public Product');

    const response = await request(app)
      .get('/products')
      .set('Cookie', ['authToken=invalid-token']);

    expect(response.status).toBe(401);
  });

  it('giữ quyền xem sản phẩm ẩn cho admin', async () => {
    await createProduct('Public Product');
    await createProduct('Hidden Product', { display: false });
    await User.create({
      phone: '0912000003',
      password: 'password123',
      name: 'Admin Product Viewer',
      role: 'admin',
    });
    const agent = request.agent(app);
    const login = await agent
      .post('/users/admin/login')
      .send({ phone: '0912000003', password: 'password123' });
    expect(login.status).toBe(200);

    const response = await agent.get('/products').query({ limit: 100 });

    expect(response.status).toBe(200);
    expect(response.body.products.map((product) => product.name).sort()).toEqual([
      'Hidden Product',
      'Public Product',
    ]);
  });
});
