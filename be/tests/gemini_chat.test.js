const {
    CHAT_RESPONSE_SCHEMA,
    GeminiChatError,
    generateChatResponse,
    normalizeGeminiResult,
    parseJsonText,
} = require('../services/geminiChat');

describe('Gemini chat service', () => {
    it('parses and validates JSON response', () => {
        expect(parseJsonText('{"reply":"Xin chao"}')).toEqual({ reply: 'Xin chao' });
        expect(normalizeGeminiResult({
            reply: ' Tu van xong ',
            intent: 'product_search',
            products: ['p1'],
            needsHuman: true,
        })).toEqual({
            reply: 'Tu van xong',
            intent: 'product_search',
            products: [{ productId: 'p1', reason: '' }],
            needsHuman: true,
        });
    });

    it('uses structured output and excludes private pricing fields', async () => {
        let body;
        const fetchImpl = jest.fn(async (_url, options) => {
            body = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    reply: 'Co san pham.',
                                    intent: 'product_search',
                                    products: [{ productId: 'p1' }],
                                    needsHuman: false,
                                }),
                            }],
                        },
                    }],
                }),
            };
        });

        const result = await generateChatResponse({
            apiKey: 'test-key',
            modelName: 'test-model',
            intent: 'product_search',
            context: { products: [{ productId: 'p1', name: 'PLC', variants: [{ price: '100' }] }] },
            fetchImpl,
        });

        expect(result.reply).toBe('Co san pham.');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(body.generationConfig.responseMimeType).toBe('application/json');
        expect(body.generationConfig.responseSchema).toEqual(CHAT_RESPONSE_SCHEMA);
        expect(JSON.stringify(body)).not.toContain('importPrice');
        expect(JSON.stringify(body)).not.toContain('earn');
    });

    it('rejects malformed response', () => {
        expect(() => parseJsonText('not-json')).toThrow(GeminiChatError);
        expect(() => normalizeGeminiResult({ reply: 'ok', intent: 'unknown', products: [], needsHuman: false }))
            .toThrow(/intent/);
    });
});
