// Luồng lai: luật chọn đối tượng + model viết câu trả lời, backend soi lại trước khi hiển thị.
process.env.CHAT_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../services/geminiChat', () => {
    const actual = jest.requireActual('../services/geminiChat');
    return {
        ...actual,
        generateEvidenceSelection: jest.fn(),
    };
});

const app = require('../index');
const { Product } = require('../models/product');
const { ChatMessage } = require('../models/chatmessage');
const { GeminiChatError, generateEvidenceSelection } = require('../services/geminiChat');
const { resetCatalogCache } = require('../services/chatCatalog');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const CODE_PREFIX = 'CHAT-COMPOSE-';
const SESSION = 'chat-compose';
const VISITOR = 'visitor-compose';

const offline = () => {
    throw new GeminiChatError('Chưa cấu hình GEMINI_API_KEY.', 'MISSING_API_KEY');
};

beforeAll(async () => {
    await mongoose.connect(DATABASE_URL);
});

beforeEach(() => {
    generateEvidenceSelection.mockReset();
    generateEvidenceSelection.mockImplementation(offline);
});

afterEach(async () => {
    await Product.deleteMany({ code: { $regex: '^' + CODE_PREFIX } });
    await ChatMessage.deleteMany({ chatSessionId: { $regex: '^' + SESSION } });
    resetCatalogCache();
});

afterAll(async () => {
    await mongoose.disconnect();
});

let sequence = 0;
const createProduct = async (overrides = {}) => {
    sequence += 1;
    const product = await Product.create({
        type: 'PLC',
        name: 'Compose PLC Siemens ' + sequence,
        brand: 'Siemens',
        section: 'Automation',
        value: 'PLC',
        code: CODE_PREFIX + sequence + '-' + Math.random().toString(36).slice(2, 7),
        warranty: '12 tháng',
        description: 'PLC dùng cho dây chuyền nhỏ.',
        specifications: 'CPU compact',
        variant: [{ price: '6850000', earn: 25, quantityForSale: 20, quantityInStorage: 20 }],
        ...overrides,
    });
    resetCatalogCache();
    return product;
};

const send = (message, overrides = {}) => request(app).post('/chat/send').send({
    message,
    chatSessionId: SESSION,
    visitorId: VISITOR,
    ...overrides,
});

describe('Chatbot lai — model viết câu trả lời có kiểm chứng', () => {
    it('trả lời câu nối tiếp trên danh sách vừa hiện và giữ thứ tự thẻ cũ', async () => {
        const cheap = await createProduct({ variant: [{ price: '3200000', earn: 10, quantityForSale: 5, quantityInStorage: 5 }] });
        await createProduct({ variant: [{ price: '9100000', earn: 10, quantityForSale: 5, quantityInStorage: 5 }] });

        const first = await send('Tìm PLC Siemens');
        expect(first.body.products.length).toBeGreaterThanOrEqual(2);
        const shownIds = first.body.products.map((product) => product.productId);

        generateEvidenceSelection.mockImplementation(async ({ mode, task, evidence, history }) => {
            expect(mode).toBe('product');
            expect(task).toBe('follow_up');
            // Lịch sử lấy từ server, có câu hỏi lượt trước.
            expect(history.some((item) => item.role === 'user' && item.content === 'Tìm PLC Siemens')).toBe(true);
            const target = evidence.products.find((product) => product.productId === cheap._id.toString());
            expect(target.shownPosition).toBeGreaterThan(0);
            return {
                answerType: 'direct', productIds: [target.productId], factIds: [], reasonIds: [], needsHuman: false,
                reply: 'Mẫu rẻ nhất là ' + target.name + ', giá 3.200.000 đ.',
            };
        });

        const second = await send('loại nào rẻ nhất');
        expect(second.status).toBe(200);
        expect(second.body.fallback).toBe(false);
        expect(second.body.reply).toContain('3.200.000 đ');
        expect(second.body.products.map((product) => product.productId)).toEqual([cheap._id.toString()]);

        // Chọn một món trong danh sách không được xoá danh sách khách đang xem.
        const stored = await ChatMessage.findOne({ chatSessionId: SESSION, role: 'assistant' })
            .sort({ createdAt: -1, _id: -1 }).lean();
        expect(stored.memory.shownProductIds.map(String)).toEqual(shownIds);
        expect(stored.memory.focusedProductIds.map(String)).toEqual([cheap._id.toString()]);
    });

    it('bỏ câu model viết khi có giá không nằm trong dữ liệu, quay về câu backend dựng', async () => {
        await createProduct();
        generateEvidenceSelection.mockImplementation(async ({ evidence }) => ({
            answerType: 'advice', productIds: [evidence.products[0].productId], factIds: [], reasonIds: [],
            needsHuman: false, reply: 'Mẫu này đang có giá 1.234.000 đ, rẻ nhất thị trường.',
        }));

        const response = await send('Tìm PLC Siemens');
        expect(response.status).toBe(200);
        expect(response.body.reply).not.toContain('1.234.000');
        expect(response.body.reply).not.toContain('rẻ nhất thị trường');
        expect(response.body.products.length).toBeGreaterThan(0);
    });

    it('so sánh đúng hai món khách chỉ bằng vị trí "cái 1 với cái 2"', async () => {
        await createProduct();
        await createProduct();
        await createProduct();

        const list = await send('Tìm PLC Siemens');
        const shownIds = list.body.products.map((product) => product.productId);
        expect(shownIds.length).toBeGreaterThanOrEqual(3);

        const compare = await send('so sánh cái 1 với cái 3');
        expect(compare.status).toBe(200);
        expect(compare.body.answerType).toBe('comparison');
        expect(compare.body.products.map((product) => product.productId)).toEqual([shownIds[0], shownIds[2]]);
    });

    it('hỏi giá khi chưa rõ món thì không báo giá món đứng đầu mà để model trả lời trên danh sách', async () => {
        const first = await createProduct({ type: 'Contactor', value: 'Contactor', name: 'Compose Contactor A', brand: 'Schneider' });
        await createProduct({
            type: 'Contactor', value: 'Contactor', name: 'Compose Contactor B', brand: 'Schneider',
            variant: [{ price: '420000', earn: 10, quantityForSale: 3, quantityInStorage: 3 }],
        });

        generateEvidenceSelection.mockImplementation(async ({ task, evidence }) => {
            expect(task).toBe('details');
            expect(evidence.products.length).toBeGreaterThanOrEqual(2);
            return {
                answerType: 'direct', productIds: [], factIds: [], reasonIds: [], needsHuman: true,
                reply: 'Contactor bên mình có mẫu từ 420.000 đ. Mua số lượng lớn bạn gọi hotline 09.0151.3825 để được báo giá tốt nhé.',
            };
        });

        const response = await send('mua 10 cái contactor thì giá sao');
        expect(response.status).toBe(200);
        expect(response.body.reply).toContain('420.000 đ');
        expect(response.body.reply).not.toContain('Giá của ' + first.name);
        expect(response.body.needsHuman).toBe(true);
    });

    it('nhóm có hàng nhưng hãng khách hỏi không có: đưa hàng cùng nhóm và báo không khớp hoàn toàn', async () => {
        const siemens = await createProduct();
        // Omron có trong danh mục (bán relay) nhưng không có PLC nào.
        await createProduct({ type: 'Relay Thời Gian', value: 'Relay', name: 'Compose Relay Omron', brand: 'Omron' });

        generateEvidenceSelection.mockImplementation(async ({ evidence }) => {
            expect(evidence.products.map((product) => product.productId)).toContain(siemens._id.toString());
            expect(evidence.hints.exactMatch).toBe(false);
            return {
                answerType: 'not_found', productIds: [siemens._id.toString()], factIds: [], reasonIds: [], needsHuman: false,
                reply: 'Bên mình chưa có PLC Omron. Hiện có PLC Siemens bạn tham khảo nhé.',
            };
        });

        const response = await send('có PLC Omron không');
        expect(response.status).toBe(200);
        expect(response.body.reply).toContain('chưa có PLC Omron');
        expect(response.body.products.map((product) => product.productId)).toEqual([siemens._id.toString()]);
    });

    it('model lỗi giữa chừng thì vẫn trả lời bằng luật, không 500', async () => {
        await createProduct();
        await send('Tìm PLC Siemens');
        const response = await send('loại nào rẻ nhất');
        expect(response.status).toBe(200);
        expect(typeof response.body.reply).toBe('string');
        expect(response.body.reply.length).toBeGreaterThan(0);
    });
});
