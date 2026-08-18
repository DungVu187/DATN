const crypto = require('crypto');
const {
    DEFAULT_INVOICE_GEMINI_MODELS,
    callInvoiceGeminiModel,
    extractInvoiceItemsWithGemini,
    parseInvoiceGeminiData,
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

    it('keeps the legacy model order, payload and markdown JSON parsing', async () => {
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
            'gemini-3.5-flash',
            'gemini-2.5-flash',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash-lite',
            'gemini-3-flash-preview',
        ]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [requestUrl, requestOptions] = fetchImpl.mock.calls[0];
        expect(requestUrl).toContain('/models/gemini-3.5-flash:generateContent?key=test-key');
        expect(requestOptions.method).toBe('POST');
        expect(requestOptions.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(JSON.parse(requestOptions.body)).toEqual({
            contents: [{
                parts: [
                    { text: 'invoice prompt' },
                    { inlineData: { mimeType: 'image/webp', data: 'base64-image' } },
                ],
            }],
        });
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

    it('tries all five legacy models and surfaces the final HTTP error', async () => {
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
            'Lỗi từ Gemini API (gemini-3-flash-preview): failed-gemini-3-flash-preview',
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

    it('aborts at 25 seconds and keeps the existing timeout message', async () => {
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
