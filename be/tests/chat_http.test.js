const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

jest.mock('../services/geminiChat', () => {
    const actual = jest.requireActual('../services/geminiChat');
    return {
        ...actual,
        generateEvidenceSelection: jest.fn(),
    };
});

const app = require('../index');
const { Product } = require('../models/product');
const { Order } = require('../models/order');
const { User } = require('../models/user');
const { ChatMessage } = require('../models/chatmessage');
const { GeminiChatError, generateEvidenceSelection } = require('../services/geminiChat');
const { resetCatalogCache } = require('../services/chatCatalog');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const CODE_PREFIX = 'CHAT-HTTP-';
// Số riêng cho suite này để dọn dẹp không đụng dữ liệu của suite khác.
const CUSTOMER_PHONE = '0912000777';

beforeAll(async () => {
    await mongoose.connect(DATABASE_URL);
});

afterEach(async () => {
    await Product.deleteMany({ code: { $regex: '^' + CODE_PREFIX } });
    await Order.deleteMany({ userPhone: CUSTOMER_PHONE });
    await User.deleteMany({ phone: CUSTOMER_PHONE });
    await ChatMessage.deleteMany({ chatSessionId: { $in: ['chat-http', 'chat-fallback'] } });
    resetCatalogCache();
    jest.clearAllMocks();
});

afterAll(async () => {
    await mongoose.disconnect();
});

const createProduct = async (overrides = {}) => {
    const product = await Product.create({
        type: 'PLC',
        name: 'Chat HTTP PLC Siemens',
        brand: 'Siemens',
        section: 'Automation',
        value: 'PLC',
        code: CODE_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        warranty: '1 năm',
        description: 'PLC dùng cho dây chuyền nhỏ.',
        specifications: 'CPU: 1214C',
        variant: [{ price: '6850000', earn: 25, quantityForSale: 20, quantityInStorage: 20 }],
        ...overrides,
    });
    // Danh mục đọc từ DB nên phải nạp lại sau khi thêm hàng mới.
    resetCatalogCache();
    return product;
};

/** Tạo khách đã đăng nhập kèm cookie auth để kiểm luồng tra đơn thật. */
const createLoggedInCustomer = async () => {
    const user = await User.create({
        name: 'Khách Chat HTTP',
        phone: CUSTOMER_PHONE,
        password: 'password123',
        role: 'customer',
    });
    const token = jwt.sign(
        { userId: user._id, phone: user.phone, name: user.name, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '12h' },
    );
    return { user, cookie: ['authToken=' + token] };
};

const createOrderFor = async (phone, overrides = {}) => Order.create({
    orderCode: CODE_PREFIX + 'ORD-' + Date.now(),
    userPhone: phone,
    userName: 'Khách Chat HTTP',
    cartItems: [],
    total: 6850000,
    ...overrides,
});

describe('Chat HTTP API', () => {
    it('answers greetings locally without calling the model', async () => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Xin chào', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('greeting');
        expect(response.body.reply).toContain('trợ lý NOVA');
        expect(generateEvidenceSelection).not.toHaveBeenCalled();
    });

    it('answers warranty policy questions from the policy text when the model is unavailable', async () => {
        generateEvidenceSelection.mockRejectedValue(new GeminiChatError('offline', 'NETWORK_ERROR'));
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Chính sách bảo hành thế nào?', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('warranty_query');
        expect(response.body.reply).toContain('Bảo hành');
        expect(response.body.answerType).toBe('direct');
    });

    it('uses a grounded model answer for a specific policy question', async () => {
        generateEvidenceSelection.mockImplementation(async ({ mode, evidence }) => {
            expect(mode).toBe('support');
            // Model chỉ nhận chính sách + thông tin cửa hàng, không có dữ liệu nội bộ.
            expect(JSON.stringify(evidence)).not.toContain('importPrice');
            return {
                answerType: 'general', productIds: [], factIds: [], reasonIds: [], needsHuman: false,
                reply: 'Bạn gọi hotline 09.0151.3825 để được hỗ trợ đổi trả nhé.',
            };
        });
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Đổi trả thế nào nếu hàng lỗi?', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.reply).toBe('Bạn gọi hotline 09.0151.3825 để được hỗ trợ đổi trả nhé.');
        expect(response.body.answerType).toBe('direct');
        expect(response.body.fallback).toBe(false);
    });

    it('drops a policy answer that invents numbers and falls back to the policy text', async () => {
        generateEvidenceSelection.mockResolvedValue({
            answerType: 'general', productIds: [], factIds: [], reasonIds: [], needsHuman: false,
            reply: 'Bên mình giao hàng miễn phí trong 2 giờ cho đơn trên 987.654 đ.',
        });
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Giao hàng mất mấy ngày?', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('shipping_query');
        expect(response.body.reply).not.toContain('987.654');
        expect(response.body.reply).not.toContain('2 giờ');
    });

    it('answers thanks locally without calling the model', async () => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'cảm ơn nhé', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.answerType).toBe('direct');
        expect(response.body.reply).not.toContain('Mình chỉ hỗ trợ');
        expect(generateEvidenceSelection).not.toHaveBeenCalled();
    });

    it('invites the visitor to log in instead of exposing order status', async () => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Kiểm tra đơn hàng của tôi', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        // Trả lời trong khung chat thay vì 401: khung chat của frontend biến lỗi
        // thành banner đỏ kèm nút "Thử lại" bấm mãi không được.
        expect(response.status).toBe(200);
        expect(response.body.reply).toContain('đăng nhập');
        expect(response.body.answerType).toBe('clarification');
        // Không được rò bất kỳ dữ liệu đơn nào cho khách chưa đăng nhập.
        expect(response.body.products).toEqual([]);
        expect(response.body.reply).not.toMatch(/trạng thái|thanh toán/);
        expect(generateEvidenceSelection).not.toHaveBeenCalled();
    });

    it.each([
        'Tôi muốn xem đơn hàng',
        'đơn hàng của tôi đến đâu rồi',
        'theo dõi đơn hàng',
        'lịch sử mua hàng',
    ])('routes %s to the order flow instead of the product flow', async (message) => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message, chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('order_status_query');
        expect(response.body.reply).toContain('đăng nhập');
        expect(generateEvidenceSelection).not.toHaveBeenCalled();
    });

    it('lists the orders of a logged-in customer', async () => {
        const { cookie } = await createLoggedInCustomer();
        await createOrderFor(CUSTOMER_PHONE, { status: 'Delivering', paymentStatus: 'PAID' });

        const response = await request(app)
            .post('/chat/send')
            .set('Cookie', cookie)
            .send({ message: 'Tôi muốn xem đơn hàng', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('order_status_query');
        expect(response.body.answerType).toBe('direct');
        expect(response.body.reply).toContain('Delivering');
        expect(response.body.reply).toContain('PAID');
        // Hỏi trạng thái thì không được lẫn hướng dẫn hủy.
        expect(response.body.reply).not.toContain('hủy');
        expect(generateEvidenceSelection).not.toHaveBeenCalled();
    });

    it('lists the orders then explains how to cancel, without cancelling anything', async () => {
        const { cookie } = await createLoggedInCustomer();
        const order = await createOrderFor(CUSTOMER_PHONE);

        const response = await request(app)
            .post('/chat/send')
            .set('Cookie', cookie)
            .send({ message: 'Tôi muốn hủy đơn', chatSessionId: 'chat-http', visitorId: 'visitor-http' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('order_status_query');
        expect(response.body.reply).toContain(order.orderCode);
        expect(response.body.reply).toContain('Mình chưa hủy đơn trực tiếp được');

        // Chatbot không có quyền ghi: đơn phải còn nguyên trạng thái cũ.
        const untouched = await Order.findById(order._id).lean();
        expect(untouched.state).toBe('Processing');
        expect(untouched.status).toBe('Processing');
    });

    it('answers price questions from the database without calling the model', async () => {
        const product = await createProduct();

        const response = await request(app).post('/chat/send').send({
            message: 'Sản phẩm này giá bao nhiêu?',
            currentProductId: product._id.toString(),
            chatSessionId: 'chat-http',
            visitorId: 'visitor-http',
        });

        expect(response.status).toBe(200);
        expect(response.body.answerType).toBe('direct');
        expect(response.body.reply).toContain('6.850.000');
        expect(generateEvidenceSelection).not.toHaveBeenCalled();
        expect(JSON.stringify(response.body)).not.toContain('importPrice');
    });

    it('builds the advice reply from backend evidence only', async () => {
        const product = await createProduct();
        generateEvidenceSelection.mockImplementation(async ({ evidence }) => ({
            answerType: 'advice',
            productIds: [evidence.products[0].productId],
            factIds: evidence.facts.filter((fact) => fact.kind === 'price').map((fact) => fact.id),
            reasonIds: [],
            questionKey: '',
            needsHuman: false,
        }));

        const response = await request(app).post('/chat/send').send({
            message: 'Tìm PLC Siemens',
            chatSessionId: 'chat-http',
            visitorId: 'visitor-http',
        });

        expect(response.status).toBe(200);
        expect(response.body.answerType).toBe('advice');
        expect(response.body.fallback).toBe(false);
        expect(response.body.reply).toContain(product.name);
        expect(response.body.reply).not.toContain('6.850.000');
    });

    it('honors clarification and persists the next question without attaching candidates', async () => {
        await createProduct();
        generateEvidenceSelection.mockResolvedValue({
            answerType: 'clarification', productIds: [], factIds: [], reasonIds: [],
            questionKey: 'need_budget', needsHuman: false,
        });
        const response = await request(app).post('/chat/send').send({
            message: 'Tìm PLC Siemens', chatSessionId: 'chat-http', visitorId: 'visitor-http',
        });
        expect(response.body.answerType).toBe('clarification');
        expect(response.body.fallback).toBe(false);
        expect(response.body.products).toEqual([]);
        expect(response.body.reply).toContain('ngân sách');
        const stored = await ChatMessage.findOne({ chatSessionId: 'chat-http', role: 'assistant' }).lean();
        expect(stored.memory.pendingQuestion.key).toBe('need_budget');
    });

    it('does not turn an unmatched model result into fallback recommendations', async () => {
        await createProduct();
        generateEvidenceSelection.mockResolvedValue({
            answerType: 'not_found', productIds: [], factIds: [], reasonIds: [], needsHuman: false,
        });
        const response = await request(app).post('/chat/send').send({
            message: 'Tìm PLC Siemens', chatSessionId: 'chat-http', visitorId: 'visitor-http',
        });
        expect(response.body.answerType).toBe('not_found');
        expect(response.body.fallback).toBe(false);
        expect(response.body.products).toEqual([]);
    });

    it('never sends internal pricing fields to the model', async () => {
        await createProduct();
        generateEvidenceSelection.mockImplementation(async ({ evidence }) => ({
            answerType: 'advice',
            productIds: [evidence.products[0].productId],
            factIds: [],
            reasonIds: [],
            questionKey: '',
            needsHuman: false,
        }));

        await request(app).post('/chat/send').send({
            message: 'Tìm PLC Siemens',
            chatSessionId: 'chat-http',
            visitorId: 'visitor-http',
        });

        const sentPayload = JSON.stringify(generateEvidenceSelection.mock.calls[0][0]);
        expect(sentPayload).not.toContain('importPrice');
        expect(sentPayload).not.toContain('quantityInStorage');
        expect(sentPayload).not.toContain('earn');
    });

    it('falls back to a local answer when the model fails', async () => {
        const product = await createProduct();
        generateEvidenceSelection.mockRejectedValue(new GeminiChatError('offline', 'NETWORK_ERROR'));

        const response = await request(app).post('/chat/send').send({
            message: 'Tìm PLC Siemens',
            chatSessionId: 'chat-fallback',
            sessionId: 'chat-session',
            visitorId: 'chat-visitor',
        });

        expect(response.status).toBe(200);
        expect(response.body.fallback).toBe(true);
        expect(response.body.intent).toBe('product_search');
        expect(response.body.products.map((item) => item.productId)).toContain(product._id.toString());
        expect(response.body.needsHuman).toBe(false);
        expect(JSON.stringify(response.body)).not.toContain('importPrice');
    });

    it('ignores a model selection that points outside the evidence set', async () => {
        const product = await createProduct();
        generateEvidenceSelection.mockImplementation(async () => {
            throw new GeminiChatError('Gemini không chọn được sản phẩm hợp lệ.', 'INVALID_SELECTION');
        });

        const response = await request(app).post('/chat/send').send({
            message: 'Tìm PLC Siemens',
            chatSessionId: 'chat-fallback',
            visitorId: 'chat-visitor',
        });

        expect(response.status).toBe(200);
        expect(response.body.fallback).toBe(true);
        expect(response.body.products.map((item) => item.productId)).toContain(product._id.toString());
    });

    it('keeps a useful escape route when the requested product is out of stock', async () => {
        const product = await createProduct({
            name: 'Chat HTTP Out of Stock',
            variant: [{ price: '6850000', earn: 25, quantityForSale: 0, quantityInStorage: 0 }],
        });
        await createProduct({ name: 'Chat HTTP Alternative' });

        const response = await request(app).post('/chat/send').send({
            message: 'Sản phẩm này còn hàng không?',
            currentProductId: product._id.toString(),
            chatSessionId: 'chat-fallback',
            visitorId: 'chat-visitor',
        });

        expect(response.status).toBe(200);
        expect(response.body.reply).toContain('hết hàng');
        expect(response.body.reply).toContain('hotline');
        expect(response.body.reply).not.toContain('báo ngay khi hàng về');
    });

    it('stores the answer type and shown products for the next turn', async () => {
        const product = await createProduct();
        generateEvidenceSelection.mockRejectedValue(new GeminiChatError('offline', 'NETWORK_ERROR'));

        await request(app).post('/chat/send').send({
            message: 'Tìm PLC Siemens',
            chatSessionId: 'chat-http',
            visitorId: 'visitor-http',
        });

        const stored = await ChatMessage.findOne({ chatSessionId: 'chat-http', role: 'assistant' }).lean();
        expect(stored.answerType).toBe('advice');
        expect(stored.memory.shownProductIds.map(String)).toContain(product._id.toString());
        expect(Number.isFinite(stored.totalLatencyMs)).toBe(true);
    });
});
