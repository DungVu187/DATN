const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ChatMessage, CHAT_HISTORY_TTL_SECONDS } = require('../models/chatmessage');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const makePayload = (overrides = {}) => ({
    message: 'Xin chào',
    chatSessionId: 'chat-history-test',
    visitorId: 'visitor-history-test',
    ...overrides,
});

beforeAll(async () => {
    await mongoose.connect(DATABASE_URL);
});

afterEach(async () => {
    await ChatMessage.deleteMany({ chatSessionId: /^chat-history-test/ });
});

afterAll(async () => {
    await mongoose.disconnect();
});

describe('Chat history API', () => {
    it('stores a user and assistant exchange and loads it after a new request', async () => {
        const sendResponse = await request(app)
            .post('/chat/send')
            .send(makePayload());

        expect(sendResponse.status).toBe(200);
        expect(await ChatMessage.countDocuments({ chatSessionId: 'chat-history-test' })).toBe(2);

        const historyResponse = await request(app)
            .get('/chat/history')
            .query({ chatSessionId: 'chat-history-test', visitorId: 'visitor-history-test' });

        expect(historyResponse.status).toBe(200);
        expect(historyResponse.body.messages).toHaveLength(2);
        expect(historyResponse.body.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
        expect(historyResponse.body.messages[0].content).toBe('Xin chào');
        expect(historyResponse.body.messages[1].intent).toBe('greeting');
        const storedAssistant = await ChatMessage.findOne({ chatSessionId: 'chat-history-test', role: 'assistant' }).lean();
        expect(storedAssistant.fallback).toBe(false);
        expect(storedAssistant.needsHuman).toBe(false);
    });

    it('deletes only the requested session for the requesting visitor', async () => {
        await request(app).post('/chat/send').send(makePayload());
        await request(app).post('/chat/send').send(makePayload({
            chatSessionId: 'chat-history-test-other',
            visitorId: 'visitor-history-other',
        }));

        const clearResponse = await request(app)
            .delete('/chat/clear')
            .send({ chatSessionId: 'chat-history-test', visitorId: 'visitor-history-test' });

        expect(clearResponse.status).toBe(200);
        expect(clearResponse.body.deleted).toBe(2);
        expect(await ChatMessage.countDocuments({ chatSessionId: 'chat-history-test' })).toBe(0);
        expect(await ChatMessage.countDocuments({ chatSessionId: 'chat-history-test-other' })).toBe(2);
    });

    it('does not expose a session to another visitor', async () => {
        await request(app).post('/chat/send').send(makePayload());

        const response = await request(app)
            .get('/chat/history')
            .query({ chatSessionId: 'chat-history-test', visitorId: 'visitor-history-other' });

        expect(response.status).toBe(200);
        expect(response.body.messages).toEqual([]);
        const clearResponse = await request(app).delete('/chat/clear')
            .send({ chatSessionId: 'chat-history-test', visitorId: 'visitor-history-other' });
        expect(clearResponse.body.deleted).toBe(0);
        expect(await ChatMessage.countDocuments({ chatSessionId: 'chat-history-test' })).toBe(2);
    });

    it('does not expose or delete account messages after logout', async () => {
        await ChatMessage.create({
            chatSessionId: 'chat-history-test',
            visitorId: 'visitor-history-test',
            userId: new mongoose.Types.ObjectId(),
            role: 'assistant',
            content: 'Private order status',
            intent: 'order_status_query',
        });
        const identifiers = { chatSessionId: 'chat-history-test', visitorId: 'visitor-history-test' };
        const history = await request(app).get('/chat/history').query(identifiers);
        expect(history.body.messages).toEqual([]);
        const cleared = await request(app).delete('/chat/clear').send(identifiers);
        expect(cleared.body.deleted).toBe(0);
        expect(await ChatMessage.countDocuments(identifiers)).toBe(1);
    });

    it('still returns the assistant response when persistence fails', async () => {
        const write = jest.spyOn(ChatMessage, 'insertMany').mockRejectedValueOnce(new Error('Database unavailable'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await request(app).post('/chat/send').send(makePayload());
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(1);
            expect(response.body.reply).toContain('trợ lý NOVA');
        } finally {
            write.mockRestore();
            log.mockRestore();
        }
    });

    it('requires both identifiers before accepting a message for persistence', async () => {
        const response = await request(app)
            .post('/chat/send')
            .send({ message: 'Xin chào' });

        expect(response.status).toBe(400);
        expect(await ChatMessage.countDocuments({ chatSessionId: /^chat-history-test/ })).toBe(0);
    });

    it('keeps the configured 30-day TTL on stored messages', () => {
        const ttlIndex = ChatMessage.schema.indexes().find(([fields, options]) => fields.createdAt === 1 && options.expireAfterSeconds);
        expect(ttlIndex[1].expireAfterSeconds).toBe(CHAT_HISTORY_TTL_SECONDS);
    });
});
