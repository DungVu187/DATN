const mongoose = require('mongoose');
const {
    CustomerBehaviorValidationError,
    MAX_EVENTS_PER_REQUEST,
    validateCustomerBehaviorPayload,
} = require('../validators/customerBehavior');
const { customerBehaviorSchema } = require('../models/customerbehavior');

describe('Customer behavior payload validation', () => {
    const productId = new mongoose.Types.ObjectId().toString();

    it('normalizes a single event and ignores untrusted userId', () => {
        const result = validateCustomerBehaviorPayload({
            visitorId: ' visitor-1 ',
            sessionId: ' session-1 ',
            eventType: 'view_product',
            productId,
            path: ' /product/1 ',
            userId: new mongoose.Types.ObjectId().toString(),
        });

        expect(result).toEqual({
            events: [{
                visitorId: 'visitor-1',
                sessionId: 'session-1',
                eventType: 'view_product',
                productId,
                path: '/product/1',
            }],
        });
    });

    it('accepts a bounded batch and rejects an unsupported event type', () => {
        const events = Array.from({ length: MAX_EVENTS_PER_REQUEST }, (_, index) => ({
            visitorId: 'visitor-1',
            sessionId: 'session-1',
            eventType: 'search_product',
            query: `PLC ${index}`,
        }));

        expect(validateCustomerBehaviorPayload({ events }).events).toHaveLength(MAX_EVENTS_PER_REQUEST);
        expect(() => validateCustomerBehaviorPayload({
            visitorId: 'visitor-1',
            sessionId: 'session-1',
            eventType: 'unknown_event',
        })).toThrow(CustomerBehaviorValidationError);
    });

    it('rejects malformed product ids and oversized batches', () => {
        expect(() => validateCustomerBehaviorPayload({
            visitorId: 'visitor-1',
            sessionId: 'session-1',
            eventType: 'click_product',
            productId: 'not-an-object-id',
        })).toThrow(/ObjectId/);

        const tooManyEvents = Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => ({
            visitorId: 'visitor-1',
            sessionId: 'session-1',
            eventType: 'view_product',
        }));
        expect(() => validateCustomerBehaviorPayload({ events: tooManyEvents }))
            .toThrow(/tối đa/);
    });

    it('defines a 90-day TTL index for createdAt', () => {
        const ttlIndex = customerBehaviorSchema.indexes().find(([fields, options]) =>
            fields.createdAt === 1 && options.expireAfterSeconds === 90 * 24 * 60 * 60
        );

        expect(ttlIndex).toBeDefined();
    });
});
