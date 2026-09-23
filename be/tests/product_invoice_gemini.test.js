const crypto = require('crypto');
const {
    DEFAULT_INVOICE_GEMINI_MODELS,
    buildInvoiceThinkingConfig,
    callInvoiceGeminiModel,
    extractInvoiceItemsWithGemini,
    parseInvoiceGeminiData,
    resolveInvoiceModels,
} = require('../services/productInvoiceGemini');
const { INVOICE_SCAN_SYSTEM_PROMPT } = require('../services/productInvoicePrompt');

const createLogger = () => ({
    log: jest.fn(),
    warn: jest.fn(),
});

const createSuccessResponse = (text) => ({
    ok: true,
    json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text }] } }],
    }),
});

describe('Product invoice Gemini extraction', () => {
    it('keeps the invoice prompt runtime contract unchanged', () => {
        expect(crypto.createHash('sha256')
            .update(INVOICE_SCAN_SYSTEM_PROMPT, 'utf8')
            .digest('hex'))
            .toBe('c7def06eebac14da05aa46bb4c22f1a9f42879ff9c2ad26041065c46e8e40a5f');
    });

    it('keeps the model order, payload and markdown JSON parsing', async () => {
        const items = [{ stt: '1', code: 'RXM2AB2BD' }];
        const fetchImpl = jest.fn().mockResolvedValue(
            createSuccessResponse('```json\n' + JSON.stringify(items) + '\n```'),
        );
        const logger = createLogger();

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'invoice prompt',
            mimeType: 'image/webp',
            base64Image: 'base64-image',
            fetchImpl,
            logger,
        })).resolves.toEqual(items);

        expect(DEFAULT_INVOICE_GEMINI_MODELS).toEqual([
            'gemini-3.8-flash',
            'gemini-3.7-flash',
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-3.5-flash-lite',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash-lite',
        ]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [requestUrl, requestOptions] = fetchImpl.mock.calls[0];
        expect(requestUrl).toContain('/models/gemini-3.8-flash:generateContent?key=test-key');
        expect(requestOptions.method).toBe('POST');
        expect(requestOptions.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(JSON.parse(requestOptions.body)).toEqual({
            contents: [{
                parts: [
                    { text: 'invoice prompt' },
                    { inlineData: { mimeType: 'image/webp', data: 'base64-image' } },
                ],
            }],
            generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' } },
        });
    });

    it('sends the thinking parameter each model family actually accepts', () => {
        // Đo thực tế: 3.6-flash và 3.5-flash-lite trả HTTP 400 với thinkingBudget,
        // còn 2.5-flash-lite trả 400 với thinkingLevel.
        expect(buildInvoiceThinkingConfig('gemini-3.8-flash')).toEqual({ thinkingLevel: 'LOW' });
        expect(buildInvoiceThinkingConfig('gemini-3.6-flash')).toEqual({ thinkingLevel: 'LOW' });
        expect(buildInvoiceThinkingConfig('gemini-3.5-flash-lite')).toEqual({ thinkingLevel: 'LOW' });
        expect(buildInvoiceThinkingConfig('gemini-2.5-flash-lite')).toEqual({ thinkingBudget: 0 });
        expect(buildInvoiceThinkingConfig('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
    });

    it('falls back to the next model when a model returns HTTP 200 with broken JSON', async () => {
        // Quan sát thật: gemini-3.8-flash có lần trả 200 nhưng JSON bị cắt giữa dòng.
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(createSuccessResponse('[{"stt":"1","price":123'))
            .mockResolvedValueOnce(createSuccessResponse('[{"stt":"1","price":123}]'));
        const logger = createLogger();

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'prompt',
            mimeType: 'image/jpeg',
            base64Image: 'image',
            fetchImpl,
            models: ['model-json-hong', 'model-du-phong'],
            logger,
        })).resolves.toEqual([{ stt: '1', price: 123 }]);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith(
            '[scan-invoice] Model model-json-hong trả về nội dung không đọc được:',
            expect.any(String),
        );
    });

    it('falls back when a model replies without any content part', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [] }) })
            .mockResolvedValueOnce(createSuccessResponse('[{"stt":"9"}]'));

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'prompt',
            mimeType: 'image/jpeg',
            base64Image: 'image',
            fetchImpl,
            models: ['model-rong', 'model-du-phong'],
            logger: createLogger(),
        })).resolves.toEqual([{ stt: '9' }]);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('lets INVOICE_GEMINI_MODELS reorder the ladder without a code change', () => {
        expect(resolveInvoiceModels()).toEqual([...DEFAULT_INVOICE_GEMINI_MODELS]);
        expect(resolveInvoiceModels(['chi-mot-model'])).toEqual(['chi-mot-model']);

        process.env.INVOICE_GEMINI_MODELS = 'gemini-3.5-flash-lite, gemini-3.7-flash';
        try {
            expect(resolveInvoiceModels()).toEqual(['gemini-3.5-flash-lite', 'gemini-3.7-flash']);
            // Tham số truyền vào vẫn thắng biến môi trường.
            expect(resolveInvoiceModels(['uu-tien-tham-so'])).toEqual(['uu-tien-tham-so']);
        } finally {
            delete process.env.INVOICE_GEMINI_MODELS;
        }
    });

    it('stops walking the ladder once the total time budget is used up', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: false, status: 429, text: jest.fn().mockResolvedValue('quota exceeded'),
        });
        const logger = createLogger();

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'prompt',
            mimeType: 'image/webp',
            base64Image: 'image',
            fetchImpl,
            budgetMs: 0,
            logger,
        })).rejects.toThrow('quota exceeded');

        // Model đầu vẫn được thử, các model sau bị chặn vì hết ngân sách thời gian.
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            '[scan-invoice] Hết ngân sách thời gian, bỏ qua các model còn lại:',
            expect.stringContaining('gemini-3.7-flash'),
        );
    });

    it('falls through non-success responses in the configured model order', async () => {
        const firstErrorText = jest.fn().mockResolvedValue('quota exceeded');
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce({ ok: false, status: 429, text: firstErrorText })
            .mockResolvedValueOnce(createSuccessResponse('[{"stt":"1"}]'));
        const logger = createLogger();

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'prompt',
            mimeType: 'image/png',
            base64Image: 'image',
            fetchImpl,
            models: ['primary-model', 'fallback-model'],
            logger,
        })).resolves.toEqual([{ stt: '1' }]);

        expect(firstErrorText).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
            expect.stringContaining('/models/primary-model:generateContent'),
            expect.stringContaining('/models/fallback-model:generateContent'),
        ]);
        expect(logger.warn).toHaveBeenCalledWith(
            '[scan-invoice] Model primary-model trả về mã lỗi HTTP 429:',
            'quota exceeded',
        );
    });

    it.each([
        ['plain JSON', '[{"stt":"1"}]', [{ stt: '1' }]],
        ['untyped markdown fence', '```\n[{"stt":"2"}]\n```', [{ stt: '2' }]],
        ['empty array', '[]', []],
    ])('parses %s using the legacy cleanup rules', (label, text, expected) => {
        expect(parseInvoiceGeminiData({
            candidates: [{ content: { parts: [{ text }] } }],
        })).toEqual(expected);
    });

    it('continues after request errors and surfaces the final model error', async () => {
        const firstError = new Error('first network error');
        const finalError = new Error('final network error');
        const fetchImpl = jest.fn()
            .mockRejectedValueOnce(firstError)
            .mockRejectedValueOnce(finalError);

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'prompt',
            mimeType: 'image/jpeg',
            base64Image: 'image',
            fetchImpl,
            models: ['first-model', 'last-model'],
            logger: createLogger(),
        })).rejects.toBe(finalError);
    });

    it('tries every configured model and surfaces the final HTTP error', async () => {
        const fetchImpl = jest.fn().mockImplementation(async (requestUrl) => {
            const modelName = requestUrl.match(/\/models\/([^:]+):generateContent/)?.[1];
            return {
                ok: false,
                status: 503,
                text: jest.fn().mockResolvedValue('failed-' + modelName),
            };
        });

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'prompt',
            mimeType: 'image/webp',
            base64Image: 'image',
            fetchImpl,
            logger: createLogger(),
        })).rejects.toThrow(
            'Lỗi từ Gemini API (gemini-2.5-flash-lite): failed-gemini-2.5-flash-lite',
        );

        expect(fetchImpl).toHaveBeenCalledTimes(DEFAULT_INVOICE_GEMINI_MODELS.length);
        expect(fetchImpl.mock.calls.map(([url]) => (
            url.match(/\/models\/([^:]+):generateContent/)?.[1]
        ))).toEqual(DEFAULT_INVOICE_GEMINI_MODELS);
    });

    it('keeps the legacy missing-content error after a successful HTTP response', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ candidates: [] }),
        });

        await expect(extractInvoiceItemsWithGemini({
            apiKey: 'test-key',
            systemPrompt: 'prompt',
            mimeType: 'image/webp',
            base64Image: 'image',
            fetchImpl,
            logger: createLogger(),
        })).rejects.toThrow('Không nhận được dữ liệu phân tích từ Gemini.');
    });

    it('aborts at the configured timeout and keeps the existing timeout message', async () => {
        jest.useFakeTimers();
        let requestSignal;
        const fetchImpl = jest.fn((requestUrl, requestOptions) => {
            requestSignal = requestOptions.signal;
            return new Promise((resolve, reject) => {
                requestSignal.addEventListener('abort', () => reject({ name: 'AbortError' }), {
                    once: true,
                });
            });
        });

        try {
            const requestPromise = callInvoiceGeminiModel({
                apiKey: 'test-key',
                modelName: 'timeout-model',
                systemPrompt: 'prompt',
                mimeType: 'image/webp',
                base64Image: 'image',
                fetchImpl,
                timeoutMs: 25000,
                logger: createLogger(),
            });
            const rejection = expect(requestPromise).rejects.toThrow(
                'Kết nối tới Gemini API (timeout-model) bị quá thời gian (Timeout 25s).',
            );

            expect(requestSignal.aborted).toBe(false);
            await jest.advanceTimersByTimeAsync(24999);
            expect(requestSignal.aborted).toBe(false);
            await jest.advanceTimersByTimeAsync(1);
            expect(requestSignal.aborted).toBe(true);
            await rejection;
            expect(jest.getTimerCount()).toBe(0);
        } finally {
            jest.useRealTimers();
        }
    });
});
