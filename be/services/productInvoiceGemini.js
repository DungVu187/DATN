const DEFAULT_INVOICE_GEMINI_MODELS = Object.freeze([
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
]);
const DEFAULT_INVOICE_GEMINI_TIMEOUT_MS = 25000;

async function callInvoiceGeminiModel({
    apiKey,
    modelName,
    systemPrompt,
    mimeType,
    base64Image,
    fetchImpl = global.fetch,
    timeoutMs = DEFAULT_INVOICE_GEMINI_TIMEOUT_MS,
    logger = console,
}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const startedAt = Date.now();
    logger.log(`[scan-invoice] Bắt đầu gọi Gemini API (${modelName}) để trích xuất chữ từ ảnh...`);

    try {
        const response = await fetchImpl(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: systemPrompt },
                            {
                                inlineData: {
                                    mimeType,
                                    data: base64Image,
                                },
                            },
                        ],
                    },
                ],
            }),
        });

        const duration = ((Date.now() - startedAt) / 1000).toFixed(2);
        logger.log(`[scan-invoice] Gemini API (${modelName}) đã phản hồi sau ${duration} giây.`);
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Kết nối tới Gemini API (${modelName}) bị quá thời gian (Timeout ${timeoutMs / 1000}s).`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function requestInvoiceGeminiResponse({
    apiKey,
    systemPrompt,
    mimeType,
    base64Image,
    fetchImpl = global.fetch,
    models = DEFAULT_INVOICE_GEMINI_MODELS,
    timeoutMs = DEFAULT_INVOICE_GEMINI_TIMEOUT_MS,
    logger = console,
}) {
    let lastError = null;

    for (const modelName of models) {
        try {
            const response = await callInvoiceGeminiModel({
                apiKey,
                modelName,
                systemPrompt,
                mimeType,
                base64Image,
                fetchImpl,
                timeoutMs,
                logger,
            });
            if (response.ok) {
                return response;
            }

            const errorText = await response.text();
            logger.warn(`[scan-invoice] Model ${modelName} trả về mã lỗi HTTP ${response.status}:`, errorText);
            lastError = new Error(`Lỗi từ Gemini API (${modelName}): ${errorText}`);
        } catch (error) {
            logger.warn(`[scan-invoice] Lỗi khi thực hiện cuộc gọi bằng model ${modelName}:`, error.message);
            lastError = error;
        }
    }

    throw lastError || new Error('Không thể kết nối đến bất kỳ model Gemini nào.');
}

function parseInvoiceGeminiData(geminiData) {
    let textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
        throw new Error('Không nhận được dữ liệu phân tích từ Gemini.');
    }

    textResult = textResult.trim();
    textResult = textResult.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(textResult);
}

async function extractInvoiceItemsWithGemini(options) {
    const response = await requestInvoiceGeminiResponse(options);
    const geminiData = await response.json();
    return parseInvoiceGeminiData(geminiData);
}

module.exports = {
    DEFAULT_INVOICE_GEMINI_MODELS,
    DEFAULT_INVOICE_GEMINI_TIMEOUT_MS,
    callInvoiceGeminiModel,
    extractInvoiceItemsWithGemini,
    parseInvoiceGeminiData,
    requestInvoiceGeminiResponse,
};
