const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../services/geminiChat', () => {
    class GeminiChatError extends Error {}
    return {
        GeminiChatError,
        generateChatResponse: jest.fn(),
    };
});

const app = require('../index');
const { Product } = require('../models/product');
const { generateChatResponse, GeminiChatError } = require('../services/geminiChat');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const CODE_PREFIX = 'CHAT-HTTP-';

beforeAll(async () => {
    await mongoose.connect(DATABASE_URL);
});

afterEach(async () => {
    await Product.deleteMany({ code: { $regex: '^' + CODE_PREFIX } });
    jest.clearAllMocks();
});

afterAll(async () => {
    await mongoose.disconnect();
});

const createProduct = () => Product.create({
    type: 'PLC',
    name: 'Chat HTTP PLC Siemens',
    brand: 'Siemens',
    section: 'Automation',
    value: 'PLC',
    code: CODE_PREFIX + Date.now(),
    warranty: '1 năm',
    description: 'PLC dùng cho dây chuyền nhỏ.',
    specifications: 'CPU: 1214C',
    variant: [{ price: '6850000', earn: 25, quantityForSale: 20, quantityInStorage: 20 }],
});

describe('Chat HTTP API', () => {
    it('answers greetings locally without calling Gemini', async () => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Xin chào' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('greeting');
        expect(response.body.reply).toContain('trợ lý NOVA');
        expect(generateChatResponse).not.toHaveBeenCalled();
    });

    it('answers warranty questions locally without calling Gemini', async () => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Chính sách bảo hành thế nào?' });

        expect(response.status).toBe(200);
        expect(response.body.intent).toBe('warranty_query');
        expect(response.body.reply).toContain('Bảo hành');
        expect(generateChatResponse).not.toHaveBeenCalled();
    });

    it('requires login before exposing order status', async () => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Kiểm tra trạng thái đơn hàng của tôi' });

        expect(response.status).toBe(401);
        expect(generateChatResponse).not.toHaveBeenCalled();
    });

    it('returns a local product fallback when Gemini fails', async () => {
        const product = await createProduct();
        generateChatResponse.mockRejectedValue(new GeminiChatError('offline'));

        const response = await request(app)
            .post('/chat/send')
            .send({
                message: 'Tìm PLC Siemens',
                currentProductId: product._id.toString(),
                sessionId: 'chat-session',
                visitorId: 'chat-visitor',
            });

        expect(response.status).toBe(200);
        expect(response.body.fallback).toBe(true);
        expect(response.body.intent).toBe('product_search');
        expect(response.body.products[0].productId).toBe(product._id.toString());
        expect(JSON.stringify(response.body)).not.toContain('importPrice');
    });

    it('compacts a verbose Gemini product paragraph while keeping product cards', async () => {
        const product = await createProduct();
        generateChatResponse.mockResolvedValue({
            reply: 'Chat dai '.repeat(90) + product.name + ' ' + product.code,
            intent: 'product_search',
            products: [{ productId: product._id.toString(), reason: 'available' }],
            needsHuman: false,
        });

        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Tìm PLC Siemens', sessionId: 'chat-session', visitorId: 'chat-visitor' });

        expect(response.status).toBe(200);
        expect(response.body.reply.length).toBeLessThan(360);
        expect(response.body.reply).toContain('NOVA tìm thấy');
        expect(response.body.products[0].reason).toBe('Đang còn hàng và có thể đặt mua trực tiếp.');
    });
});
