const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { StorageHistory } = require('../models/storagehistory');
const { User } = require('../models/user');
const { defaultPermissionsFor } = require('./fixtures/adminPermissions');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PASSWORD = 'password123';
let phoneSequence = 981200000;

function nextPhone() {
  phoneSequence += 1;
  return '0' + String(phoneSequence);
}

async function createAgent({ role, permissions = defaultPermissionsFor(role) }) {
  const phone = nextPhone();
  await User.create({
    phone,
    password: PASSWORD,
    name: 'Order Lifecycle ' + role,
    role,
    functions: role === 'customer' ? [] : ['order_management'],
    permissions,
  });

  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const login = await agent.post(endpoint).send({ phone, password: PASSWORD });
  expect(login.status).toBe(200);
  return { agent, phone };
}

async function createProduct({ quantityForSale = 10, quantityInStorage = 10 } = {}) {
  return Product.create({
    type: 'PLC',
    name: 'Order Lifecycle Product',
    brand: 'Test Brand',
    section: 'Thiết bị tự động hóa',
    value: 'PLC',
    warranty: '12 tháng',
    variant: [{
      price: '100000',
      color: 'Xám',
      quantityForSale,
      quantityInStorage,
    }],
  });
}

async function createOrder({
  userPhone,
  product,
  orderCode,
  quantity = 1,
  status = 'Processing',
  state = 'Processing',
  payment = false,
  paymentStatus = payment ? 'PAID' : 'UNPAID',
}) {
  return Order.create({
    paymentStatus,
    orderCode,
    userPhone,
    userName: 'Lifecycle Customer',
    cartItems: [{
      productId: product._id.toString(),
      variantIndex: 0,
      quantity,
    }],
    total: 100000 * quantity,
    status,
    state,
    payment,
  });
}

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([
    Order.deleteMany({}),
    Product.deleteMany({}),
    StorageHistory.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Order lifecycle HTTP characterization', () => {
  it('keeps update permission separate from privileged cancel/delete access', async () => {
    const customerPhone = nextPhone();
    const product = await createProduct({ quantityForSale: 5 });
    const orderToCancel = await createOrder({
      userPhone: customerPhone,
      product,
      orderCode: 'NOVA-LIFECYCLE-PERM-1',
    });
    const orderToDelete = await createOrder({
      userPhone: customerPhone,
      product,
      orderCode: 'NOVA-LIFECYCLE-PERM-2',
    });
    const { agent } = await createAgent({ role: 'staff', permissions: ['order.view'] });

    const update = await agent
      .put('/orders/update-order/' + orderToCancel._id)
      .send({ field: 'payment', value: true });
    expect(update.status).toBe(403);
    expect(update.body.message).toBe('Access denied, missing permission: order.edit');

    const cancel = await agent.put('/orders/' + orderToCancel._id).send({});
    const remove = await agent.delete('/orders/' + orderToDelete._id);
    expect(cancel.status).toBe(200);
    expect(remove.status).toBe(200);
  });

  it('preserves payment updates and status validation responses', async () => {
    const { agent } = await createAgent({ role: 'admin' });
    const product = await createProduct();
    const order = await createOrder({
      userPhone: nextPhone(),
      product,
      orderCode: 'NOVA-LIFECYCLE-UPDATE',
    });

    const invalidField = await agent
      .put('/orders/update-order/' + order._id)
      .send({ field: 'unknown', value: true });
    expect(invalidField.status).toBe(400);
    expect(invalidField.body).toEqual({ success: false, message: 'Invalid field' });

    const invalidStatus = await agent
      .put('/orders/update-order/' + order._id)
      .send({ field: 'status', value: 'Cancelled' });
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body).toEqual({ success: false, message: 'Invalid status value' });

    const payment = await agent
      .put('/orders/update-order/' + order._id)
      .send({ field: 'payment', value: true });
    expect(payment.status).toBe(200);
    expect(payment.body).toMatchObject({
      success: true,
      message: 'Order updated successfully',
      order: { payment: true, status: 'Processing', completedAt: null },
    });

    const delivering = await agent
      .put('/orders/update-order/' + order._id)
      .send({ field: 'status', value: 'Delivering' });
    expect(delivering.status).toBe(200);
    expect(delivering.body.order.status).toBe('Delivering');
    expect(delivering.body.order.completedAt).toBeNull();

    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(10);
    expect(unchangedProduct.variant[0].quantityInStorage).toBe(10);
    expect(unchangedProduct.purchaseCount).toBe(0);
  });

  it('sets and clears completedAt with completion and rollback', async () => {
    const { agent } = await createAgent({ role: 'admin' });
    const product = await createProduct();
    const order = await createOrder({
      userPhone: nextPhone(),
      product,
      orderCode: 'NOVA-LIFECYCLE-COMPLETED-AT',
      quantity: 2,
    });

    const completed = await agent
      .put('/orders/update-order/' + order._id)
      .send({ field: 'status', value: 'Completed' });
    expect(completed.status).toBe(200);
    expect(completed.body.order.completedAt).toEqual(expect.any(String));

    const reverted = await agent
      .put('/orders/update-order/' + order._id)
      .send({ field: 'status', value: 'Processing' });
    expect(reverted.status).toBe(200);
    expect(reverted.body.order.completedAt).toBeNull();
  });

  it('preserves missing, completed, and already-cancelled guards', async () => {
    const { agent, phone } = await createAgent({ role: 'customer' });
    const product = await createProduct();
    const completedOrder = await createOrder({
      userPhone: phone,
      product,
      orderCode: 'NOVA-LIFECYCLE-CANCEL-COMPLETE',
      status: 'Completed',
    });
    const cancelledOrder = await createOrder({
      userPhone: phone,
      product,
      orderCode: 'NOVA-LIFECYCLE-CANCEL-AGAIN',
      state: 'Cancelled',
    });

    const missing = await agent.put('/orders/' + new mongoose.Types.ObjectId()).send({});
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Order not found' });

    const completed = await agent.put('/orders/' + completedOrder._id).send({});
    expect(completed.status).toBe(400);
    expect(completed.body).toEqual({ message: 'Không thể hủy đơn hàng đã hoàn thành.' });

    const cancelled = await agent.put('/orders/' + cancelledOrder._id).send({});
    expect(cancelled.status).toBe(400);
    expect(cancelled.body).toEqual({ message: 'Order is already cancelled.' });
  });

  it('deletes cancelled orders without restoring stock twice and blocks completed orders', async () => {
    const { agent, phone } = await createAgent({ role: 'customer' });
    const cancelledProduct = await createProduct({ quantityForSale: 6 });
    const completedProduct = await createProduct({ quantityForSale: 4 });
    const cancelledOrder = await createOrder({
      userPhone: phone,
      product: cancelledProduct,
      orderCode: 'NOVA-LIFECYCLE-DELETE-CANCELLED',
      quantity: 2,
      state: 'Cancelled',
    });
    const completedOrder = await createOrder({
      userPhone: phone,
      product: completedProduct,
      orderCode: 'NOVA-LIFECYCLE-DELETE-COMPLETED',
      status: 'Completed',
    });

    const removeCancelled = await agent.delete('/orders/' + cancelledOrder._id);
    expect(removeCancelled.status).toBe(200);
    expect(removeCancelled.body).toEqual({
      message: 'Order deleted and quantities restored if necessary.',
    });
    const cancelledStock = await Product.findById(cancelledProduct._id);
    expect(cancelledStock.variant[0].quantityForSale).toBe(6);

    const removeCompleted = await agent.delete('/orders/' + completedOrder._id);
    expect(removeCompleted.status).toBe(400);
    expect(removeCompleted.body).toEqual({ message: 'Không thể xóa đơn hàng đã hoàn thành.' });
    expect(await Order.findById(completedOrder._id)).not.toBeNull();
  });

  it('blocks customers from cancelling or deleting a paid order', async () => {
    const { agent, phone } = await createAgent({ role: 'customer' });
    const product = await createProduct({ quantityForSale: 5 });
    const paidOrder = await createOrder({
      userPhone: phone,
      product,
      orderCode: 'NOVA-REFUND-CUSTOMER',
      payment: true,
    });

    const cancel = await agent.put('/orders/' + paidOrder._id).send({});
    expect(cancel.status).toBe(400);
    expect(cancel.body.message).toContain('hotline');

    const remove = await agent.delete('/orders/' + paidOrder._id);
    expect(remove.status).toBe(400);
    expect(remove.body).toEqual({ message: 'Không thể xóa đơn hàng đã thanh toán nhưng chưa hoàn tiền.' });

    const unchanged = await Order.findById(paidOrder._id);
    expect(unchanged.state).toBe('Processing');
    const stock = await Product.findById(product._id);
    expect(stock.variant[0].quantityForSale).toBe(5);
  });

  it('lets staff cancel a paid order and confirm the manual refund once', async () => {
    const { agent } = await createAgent({ role: 'admin' });
    const { agent: viewer } = await createAgent({ role: 'staff', permissions: ['order.view'] });
    const product = await createProduct();
    const order = await createOrder({
      userPhone: nextPhone(),
      product,
      orderCode: 'NOVA-REFUND-ADMIN',
      payment: true,
    });

    const notCancelledYet = await agent.put('/orders/' + order._id + '/refund').send({ note: 'FT123' });
    expect(notCancelledYet.status).toBe(400);

    const cancel = await agent.put('/orders/' + order._id).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.order).toMatchObject({ state: 'Cancelled', payment: true, paymentStatus: 'PAID' });

    const togglePayment = await agent
      .put('/orders/update-order/' + order._id)
      .send({ field: 'payment', value: false });
    expect(togglePayment.status).toBe(400);

    const removeBeforeRefund = await agent.delete('/orders/' + order._id);
    expect(removeBeforeRefund.status).toBe(400);

    const missingNote = await agent.put('/orders/' + order._id + '/refund').send({ note: '   ' });
    expect(missingNote.status).toBe(400);

    const noPermission = await viewer.put('/orders/' + order._id + '/refund').send({ note: 'FT123' });
    expect(noPermission.status).toBe(403);

    const refund = await agent.put('/orders/' + order._id + '/refund').send({ note: '  FT123 Vietcombank  ' });
    expect(refund.status).toBe(200);
    expect(refund.body.order).toMatchObject({
      paymentStatus: 'REFUNDED',
      refundNote: 'FT123 Vietcombank',
      refundedAt: expect.any(String),
    });

    const refundAgain = await agent.put('/orders/' + order._id + '/refund').send({ note: 'FT999' });
    expect(refundAgain.status).toBe(400);
    expect(refundAgain.body.message).toBe('Đơn hàng không ở trạng thái chờ hoàn tiền.');

    const detail = await agent.get('/orders/admin-detail/' + order._id);
    expect(detail.body.order).toMatchObject({ paymentStatus: 'REFUNDED', refundNote: 'FT123 Vietcombank' });

    const removeAfterRefund = await agent.delete('/orders/' + order._id);
    expect(removeAfterRefund.status).toBe(200);
  });

  it('restores active-order stock only once under concurrent delete', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, phone } = await createAgent({ role: 'customer' });
    const product = await createProduct({ quantityForSale: 3 });
    const order = await createOrder({
      userPhone: phone,
      product,
      orderCode: 'NOVA-LIFECYCLE-DELETE-RACE',
      quantity: 2,
    });

    const responses = await Promise.all([
      agent.delete('/orders/' + order._id),
      agent.delete('/orders/' + order._id),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.every((response) => [200, 404, 409].includes(response.status))).toBe(true);
    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.variant[0].quantityForSale).toBe(5);
    expect(await Order.findById(order._id)).toBeNull();
  });
});
