const {
    CHAT_SELECTION_SCHEMA,
    DEFAULT_GEMINI_CHAT_MODELS,
    GeminiChatError,
    generateEvidenceSelection,
    normalizeSelection,
    parseJsonText,
    resolveChatModels,
} = require('../services/geminiChat');

const evidence = {
    products: [
        { productId: 'p1', name: 'PLC S7-1200', code: 'PLC-1', type: 'PLC', brand: 'Siemens', availability: 'available' },
        { productId: 'p2', name: 'PLC FX3U', code: 'PLC-2', type: 'PLC', brand: 'Mitsubishi', availability: 'out_of_stock' },
    ],
    facts: [
        { id: 'f0_price', productId: 'p1', kind: 'price', text: 'Giá 6.850.000 đ.' },
        { id: 'f1_price', productId: 'p2', kind: 'price', text: 'Giá 7.000.000 đ.' },
    ],
    reasons: [
        { id: 'r0_type', productId: 'p1', text: 'đúng nhóm PLC' },
        { id: 'r1_type', productId: 'p2', text: 'đúng nhóm PLC' },
    ],
    questionKeys: ['need_usage', 'need_specs'],
};

describe('Gemini chat evidence selection', () => {
    it('parses JSON and keeps only allowed evidence identifiers', () => {
        expect(parseJsonText('{"answerType":"advice"}')).toEqual({ answerType: 'advice' });

        expect(normalizeSelection({
            answerType: 'advice',
            productIds: ['p1', 'p-unknown'],
            factIds: ['f0_price', 'f1_price', 'f-unknown'],
            reasonIds: ['r0_type', 'r1_type'],
            questionKey: 'need_budget',
            needsHuman: false,
            advisory: '  Mình gợi ý dòng PLC này.  ',
        }, evidence)).toEqual({
            answerType: 'advice',
            productIds: ['p1'],
            // Fact của sản phẩm không được chọn và ID lạ đều bị loại.
            factIds: ['f0_price'],
            reasonIds: ['r0_type'],
            questionKey: '',
            needsHuman: false,
            advisory: 'Mình gợi ý dòng PLC này.',
        });
    });

    it('rejects malformed answers and selections without a valid product', () => {
        expect(() => parseJsonText('not-json')).toThrow(GeminiChatError);
        expect(() => normalizeSelection({ answerType: 'unknown', productIds: [], factIds: [], reasonIds: [], needsHuman: false }, evidence))
            .toThrow(/answerType/);
        expect(() => normalizeSelection({
            answerType: 'advice', productIds: ['nope'], factIds: [], reasonIds: [], needsHuman: false,
        }, evidence)).toThrow(GeminiChatError);
        expect(() => normalizeSelection({
            answerType: 'clarification', productIds: [], factIds: [], reasonIds: [], questionKey: 'khong-hop-le', needsHuman: false,
        }, evidence)).toThrow(GeminiChatError);
    });

    it('sends structured output and never leaks private pricing fields', async () => {
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
                                    answerType: 'advice',
                                    productIds: ['p1'],
                                    factIds: ['f0_price'],
                                    reasonIds: ['r0_type'],
                                    questionKey: '',
                                    needsHuman: false,
                                }),
                            }],
                        },
                    }],
                }),
            };
        });

        const selection = await generateEvidenceSelection({
            apiKey: 'test-key',
            modelName: 'test-model',
            question: 'Tìm PLC Siemens',
            task: 'search',
            evidence,
            fetchImpl,
        });

        expect(selection.productIds).toEqual(['p1']);
        expect(body.generationConfig.responseMimeType).toBe('application/json');
        expect(body.generationConfig.responseSchema).toEqual(CHAT_SELECTION_SCHEMA);
        expect(JSON.stringify(body)).not.toContain('importPrice');
        expect(JSON.stringify(body)).not.toContain('quantityInStorage');
    });

    it('maps a missing API key to a Gemini error instead of crashing', async () => {
        const fetchImpl = jest.fn();
        await expect(generateEvidenceSelection({ apiKey: '', evidence, question: 'x', fetchImpl }))
            .rejects.toThrow(GeminiChatError);
        // Thiếu key thì không thử model nào, tránh gọi API vô ích.
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('Gemini chat model fallback', () => {
    const okBody = {
        answerType: 'advice',
        productIds: ['p1'],
        factIds: ['f0_price'],
        reasonIds: ['r0_type'],
        questionKey: '',
        needsHuman: false,
    };
    const okResponse = () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(okBody) }] } }] }),
    });
    const quotaResponse = () => ({ ok: false, status: 429, text: async () => 'quota exceeded' });
    const modelOf = (url) => String(url).match(/\/models\/([^:]+):generateContent/)?.[1];
    const silentLogger = { warn: () => { }, log: () => { } };

    it('starts from the strongest model and only falls back when it is blocked', async () => {
        const fetchImpl = jest.fn(async (url) => (
            modelOf(url) === DEFAULT_GEMINI_CHAT_MODELS[0] ? quotaResponse() : okResponse()
        ));
        const logger = { warn: jest.fn(), log: jest.fn() };

        const selection = await generateEvidenceSelection({
            apiKey: 'test-key', question: 'Tìm PLC', task: 'search', evidence, fetchImpl, logger,
        });

        expect(selection.productIds).toEqual(['p1']);
        expect(fetchImpl.mock.calls.map(([url]) => modelOf(url)))
            .toEqual([DEFAULT_GEMINI_CHAT_MODELS[0], DEFAULT_GEMINI_CHAT_MODELS[1]]);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_GEMINI_CHAT_MODELS[1]));
    });

    it('walks the whole ladder and reports the last error when every model is blocked', async () => {
        const fetchImpl = jest.fn(async () => quotaResponse());
        const logger = { warn: jest.fn(), log: jest.fn() };

        await expect(generateEvidenceSelection({
            apiKey: 'test-key', question: 'Tìm PLC', task: 'search', evidence, fetchImpl, logger,
        })).rejects.toThrow(/429/);

        expect(fetchImpl).toHaveBeenCalledTimes(DEFAULT_GEMINI_CHAT_MODELS.length);
        expect(fetchImpl.mock.calls.map(([url]) => modelOf(url))).toEqual([...DEFAULT_GEMINI_CHAT_MODELS]);
    });

    it('stops the ladder once the total time budget is used up', async () => {
        const fetchImpl = jest.fn(async () => quotaResponse());

        await expect(generateEvidenceSelection({
            apiKey: 'test-key', question: 'Tìm PLC', task: 'search', evidence, fetchImpl, budgetMs: 0, logger: silentLogger,
        })).rejects.toThrow(GeminiChatError);

        // Model đầu vẫn được thử, các model sau bị chặn vì hết ngân sách thời gian.
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('pins a single model when one is requested explicitly or via env', async () => {
        const fetchImpl = jest.fn(async () => quotaResponse());
        await expect(generateEvidenceSelection({
            apiKey: 'test-key', modelName: 'gemini-3.5-flash', evidence, question: 'x', fetchImpl, logger: silentLogger,
        })).rejects.toThrow(GeminiChatError);
        expect(fetchImpl.mock.calls.map(([url]) => modelOf(url))).toEqual(['gemini-3.5-flash']);

        process.env.GEMINI_CHAT_MODELS = 'gemini-3.8-flash, gemini-3.5-flash-lite';
        try {
            expect(resolveChatModels()).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
        } finally {
            delete process.env.GEMINI_CHAT_MODELS;
        }
        expect(resolveChatModels()).toEqual([...DEFAULT_GEMINI_CHAT_MODELS]);
    });
});
