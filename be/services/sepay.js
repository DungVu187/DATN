const crypto = require('crypto');

const normalizePaymentReference = (value) => String(value || '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const getSepayConfig = () => ({
  bankCode: String(process.env.SEPAY_BANK_CODE || '').trim(),
  accountNumber: String(process.env.SEPAY_ACCOUNT_NUMBER || '').replace(/\s+/g, ''),
  accountName: String(process.env.SEPAY_ACCOUNT_NAME || '').trim(),
  webhookApiKey: String(process.env.SEPAY_WEBHOOK_API_KEY || '').trim(),
  paymentPrefix: normalizePaymentReference(process.env.SEPAY_PAYMENT_PREFIX || 'NOVA'),
  qrTemplate: String(process.env.SEPAY_QR_TEMPLATE || 'compact').trim(),
});

const assertSepayConfigured = () => {
  const config = getSepayConfig();
  if (!config.bankCode || !config.accountNumber || !config.accountName) {
    const error = new Error('SePay chưa được cấu hình đầy đủ.');
    error.statusCode = 503;
    throw error;
  }
  return config;
};

const createPaymentReference = (orderCode) => {
  const config = getSepayConfig();
  const normalizedOrderCode = normalizePaymentReference(orderCode).replace(/^NOVA/, '');
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${config.paymentPrefix}${normalizedOrderCode}${randomSuffix}`;
};

const buildTransferDescription = ({ bankCode, reference }) => (
  String(bankCode || '').trim().toUpperCase() === 'ICB'
    ? `SEVQR ${reference}`
    : reference
);

const buildSepayQrUrl = ({ amount, reference }) => {
  const config = assertSepayConfigured();
  const query = new URLSearchParams({
    acc: config.accountNumber,
    bank: config.bankCode,
    amount: String(Math.round(Number(amount) || 0)),
    des: buildTransferDescription({ bankCode: config.bankCode, reference }),
    template: config.qrTemplate,
  });
  return `https://qr.sepay.vn/img?${query.toString()}`;
};

const buildSepayPaymentDetails = (order) => {
  const config = assertSepayConfigured();
  return {
    provider: 'SEPAY',
    reference: order.paymentReference,
    amount: order.paymentAmount || order.total,
    bankCode: config.bankCode,
    accountNumber: config.accountNumber,
    accountName: config.accountName,
    transferContent: buildTransferDescription({
      bankCode: config.bankCode,
      reference: order.paymentReference,
    }),
    expiresAt: order.paymentExpiresAt,
    qrUrl: buildSepayQrUrl({
      amount: order.paymentAmount || order.total,
      reference: order.paymentReference,
    }),
  };
};

const safeCompare = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifySepayWebhook = (authorizationHeader) => {
  const { webhookApiKey } = getSepayConfig();
  if (!webhookApiKey) return false;
  const receivedKey = String(authorizationHeader || '')
    .replace(/^Apikey\s+/i, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  return safeCompare(receivedKey, webhookApiKey);
};

const extractPaymentReference = (payload) => {
  const directCode = normalizePaymentReference(payload?.code);
  const prefix = getSepayConfig().paymentPrefix;
  if (directCode.startsWith(prefix)) return directCode;

  const contentCandidates = [payload?.content, payload?.description, payload?.transactionContent];
  const referencePattern = new RegExp(`${prefix}[A-Z0-9]+`, 'i');
  for (const candidate of contentCandidates) {
    const match = String(candidate || '').match(referencePattern);
    if (match?.[0]) return normalizePaymentReference(match[0]);
  }
  return '';
};

module.exports = {
  assertSepayConfigured,
  buildSepayPaymentDetails,
  createPaymentReference,
  extractPaymentReference,
  getSepayConfig,
  normalizePaymentReference,
  verifySepayWebhook,
};
