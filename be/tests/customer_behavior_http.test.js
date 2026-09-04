const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { CustomerBehavior } = require('../models/customerbehavior');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const TEST_PHONE = `09${String(Date.now()).slice(-8)}`;

beforeAll(async () => {
    await mongoose.connect(DATABASE_URL);
});

afterEach(async () => {
    await CustomerBehavior.deleteMany({});
    await User.deleteMany({ phone: TEST_PHONE });
});

afterAll(async () => {
    await mongoose.disconnect();
});

describe('POST /chat/events', () => {
    it('records a guest batch without accepting a client-supplied userId', async () => {
        const forgedUserId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .post('/chat/events')
            .send({
                events: [
                    {
                        visitorId: 'visitor-guest-1',
                        sessionId: 'session-guest-1',
                        eventType: 'view_product',
                        productId: new mongoose.Types.ObjectId().toString(),
                    },
                    {
                        visitorId: 'visitor-guest-1',
                        sessionId: 'session-guest-1',
                        eventType: 'search_product',
                        query: 'PLC Siemens',
                        path: '/products',
                        userId: forgedUserId.toString(),
                    },
                ],
            });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ success: 1, accepted: 2 });

        const savedEvents = await CustomerBehavior.find({}).lean();
        expect(savedEvents).toHaveLength(2);
        expect(savedEvents.every((event) => event.userId === undefined)).toBe(true);
        expect(savedEvents.every((event) => !Object.prototype.hasOwnProperty.call(event, 'ip'))).toBe(true);
    });

    it('attaches the authenticated database user instead of trusting the payload', async () => {
        const user = await User.create({
            phone: TEST_PHONE,
            password: 'password123',
            name: 'Chat Behavior Customer',
            role: 'customer',
        });
        const agent = request.agent(app);
        const loginResponse = await agent
            .post('/users/login')
            .send({ phone: TEST_PHONE, password: 'password123' });

        expect(loginResponse.status).toBe(200);

        const response = await agent
            .post('/chat/events')
            .send({
                visitorId: 'visitor-user-1',
                sessionId: 'session-user-1',
                eventType: 'add_to_cart',
                productId: new mongoose.Types.ObjectId().toString(),
                userId: new mongoose.Types.ObjectId().toString(),
            });

        expect(response.status).toBe(201);
        const savedEvent = await CustomerBehavior.findOne({ visitorId: 'visitor-user-1' }).lean();
        expect(String(savedEvent.userId)).toBe(String(user._id));
    });

    it('rejects invalid events without writing anything', async () => {
        const response = await request(app)
            .post('/chat/events')
            .send({
                visitorId: 'visitor-invalid',
                sessionId: 'session-invalid',
                eventType: 'not_supported',
            });

        expect(response.status).toBe(400);
        expect(await CustomerBehavior.countDocuments({})).toBe(0);
    });
});
