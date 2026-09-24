const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');
const { Product } = require('../components/product');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
  await Product.deleteMany({});
});

const createCustomerAgent = async () => {
  const user = new User({
    phone: '0911000001',
    password: 'password123',
    name: 'Cart Customer',
    role: 'customer',
  });
  await user.save();

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/login')
    .send({ phone: user.phone, password: 'password123' });

  expect(loginRes.status).toBe(200);
  return { agent, user };
};

describe('Cart API', () => {
  it('adds new item, accumulates duplicate quantity, returns cart, removes item and clears cart', async () => {
    const { agent, user } = await createCustomerAgent();
    const product = await Product.create({
      type: 'PLC',
      name: 'Cart Product',
      brand: 'Test Brand',
      section: 'Automation',
      value: 'PLC',
      warranty: '12 tháng',
      display: true,
      variant: [
        { price: '100000', quantityForSale: 10, quantityInStorage: 10 },
        { price: '120000', quantityForSale: 10, quantityInStorage: 10 },
      ],
    });
    const productId = product._id.toString();

    const firstAdd = await agent
      .post('/carts/addToCart')
      .send({ productId, variantIndex: 0, quantity: 2 });
    expect(firstAdd.status).toBe(200);

    let userInDb = await User.findById(user._id);
    expect(userInDb.cart).toHaveLength(1);
    expect(userInDb.cart[0].quantity).toBe(2);

    const secondAdd = await agent
      .post('/carts/addToCart')
      .send({ productId, variantIndex: 0, quantity: 3 });
    expect(secondAdd.status).toBe(200);

    userInDb = await User.findById(user._id);
    expect(userInDb.cart).toHaveLength(1);
    expect(userInDb.cart[0].quantity).toBe(5);

    const getCart = await agent.get('/carts/getCart');
    expect(getCart.status).toBe(200);
    expect(getCart.body.cart).toHaveLength(1);
    expect(getCart.body.cart[0].quantity).toBe(5);
    expect(getCart.body.cart[0].available).toBe(true);

    const remove = await agent
      .post('/carts/removeFromCart')
      .send({ productId, variantIndex: 0 });
    expect(remove.status).toBe(200);

    userInDb = await User.findById(user._id);
    expect(userInDb.cart).toHaveLength(0);

    await agent
      .post('/carts/addToCart')
      .send({ productId, variantIndex: 1, quantity: 1 });

    const clear = await agent.post('/carts/clearCart');
    expect(clear.status).toBe(200);

    userInDb = await User.findById(user._id);
    expect(userInDb.cart).toHaveLength(0);
  });

  it('rejects invalid quantities and quantities above available stock', async () => {
    const { agent, user } = await createCustomerAgent();
    const product = await Product.create({
      type: 'PLC',
      name: 'Cart Stock Product',
      brand: 'Test Brand',
      section: 'Automation',
      value: 'PLC',
      warranty: '12 tháng',
      display: true,
      variant: [
        { price: '100000', quantityForSale: 5, quantityInStorage: 5 },
        { price: '120000', quantityForSale: 0, quantityInStorage: 0 },
      ],
    });
    const productId = product._id.toString();

    for (const quantity of [-1, 0, 1.5, 'abc', '']) {
      const invalid = await agent.post('/carts/addToCart').send({ productId, variantIndex: 0, quantity });
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toBe('Số lượng phải là số nguyên lớn hơn 0.');
    }

    const overStock = await agent.post('/carts/addToCart').send({ productId, variantIndex: 0, quantity: 6 });
    expect(overStock.status).toBe(409);
    expect(overStock.body.message).toBe('Chỉ còn 5 sản phẩm.');

    const outOfStock = await agent.post('/carts/addToCart').send({ productId, variantIndex: 1, quantity: 1 });
    expect(outOfStock.status).toBe(409);

    const fitsStock = await agent.post('/carts/addToCart').send({ productId, variantIndex: 0, quantity: '3' });
    expect(fitsStock.status).toBe(200);

    // Cộng dồn với số đã có trong giỏ cũng không được vượt tồn kho
    const accumulated = await agent.post('/carts/addToCart').send({ productId, variantIndex: 0, quantity: 3 });
    expect(accumulated.status).toBe(409);
    expect(accumulated.body.message).toBe('Chỉ còn 5 sản phẩm, giỏ hàng của bạn đã có 3.');

    for (const quantity of [-1, 0, 1.5, 'abc']) {
      const invalidUpdate = await agent.put('/carts/updateCartItem').send({ productId, variantIndex: 0, quantity });
      expect(invalidUpdate.status).toBe(400);
    }
    const updateOverStock = await agent.put('/carts/updateCartItem').send({ productId, variantIndex: 0, quantity: 99999 });
    expect(updateOverStock.status).toBe(409);

    const updateOk = await agent.put('/carts/updateCartItem').send({ productId, variantIndex: 0, quantity: 5 });
    expect(updateOk.status).toBe(200);

    const userInDb = await User.findById(user._id);
    expect(userInDb.cart).toHaveLength(1);
    expect(userInDb.cart[0].quantity).toBe(5);
  });

  it('allows customers to add any visible product and marks hidden products unavailable', async () => {
    const allowedProduct = await Product.create({
      type: 'PLC',
      name: 'Allowed Product',
      brand: 'Test Brand',
      section: 'Automation',
      value: 'PLC',
      warranty: '12 tháng',
      display: true,
      variant: [{ price: '100000', quantityForSale: 10, quantityInStorage: 10 }],
    });
    const blockedProduct = await Product.create({
      type: 'PLC',
      name: 'Blocked Product',
      brand: 'Test Brand',
      section: 'Automation',
      value: 'PLC',
      warranty: '12 tháng',
      display: true,
      variant: [{ price: '100000', quantityForSale: 10, quantityInStorage: 10 }],
    });
    await Product.updateOne({ _id: blockedProduct._id }, { $set: { display: false } });
    const { agent, user } = await createCustomerAgent();

    const blockedAdd = await agent
      .post('/carts/addToCart')
      .send({ productId: blockedProduct._id.toString(), variantIndex: 0, quantity: 1 });
    expect(blockedAdd.status).toBe(403);

    const allowedAdd = await agent
      .post('/carts/addToCart')
      .send({ productId: allowedProduct._id.toString(), variantIndex: 0, quantity: 1 });
    expect(allowedAdd.status).toBe(200);

    await User.updateOne(
      { _id: user._id },
      {
        $push: {
          cart: {
            productId: blockedProduct._id.toString(),
            variantIndex: 0,
            quantity: 1,
            status: true,
          },
        },
      }
    );

    const getCart = await agent.get('/carts/getCart');
    expect(getCart.status).toBe(200);
    expect(getCart.body.cart).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: allowedProduct._id.toString(), available: true }),
      expect.objectContaining({ productId: blockedProduct._id.toString(), available: false }),
    ]));
  });

  it('chặn thêm sản phẩm chỉ nhận liên hệ và đánh dấu item cũ không khả dụng', async () => {
    const contactProduct = await Product.create({
      type: 'PLC',
      name: 'Contact Product',
      brand: 'Test Brand',
      section: 'Automation',
      value: 'PLC',
      warranty: '12 tháng',
      display: true,
      variant: [{
        price: '5480000',
        importPrice: '5480000',
        earn: 0,
        quantityForSale: 18,
        quantityInStorage: 20,
      }],
    });
    const { agent, user } = await createCustomerAgent();

    const addResponse = await agent
      .post('/carts/addToCart')
      .send({ productId: contactProduct._id.toString(), variantIndex: 0, quantity: 1 });
    expect(addResponse.status).toBe(409);
    expect(addResponse.body.message).toContain('chỉ nhận liên hệ');

    await User.updateOne(
      { _id: user._id },
      {
        $push: {
          cart: {
            productId: contactProduct._id.toString(),
            variantIndex: 0,
            quantity: 1,
            status: true,
          },
        },
      }
    );

    const getCart = await agent.get('/carts/getCart');
    expect(getCart.status).toBe(200);
    expect(getCart.body.cart[0]).toEqual(expect.objectContaining({ available: false }));
  });
});
