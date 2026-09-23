/**
 * Danh sách model theo thứ tự ưu tiên: mạnh nhất trước, hạ dần khi model trên không dùng được.
 *
 * Bốn model Flash đầu cho chất lượng đọc tốt nhất nhưng hạn mức thấp (5 RPM / 20 RPD mỗi model).
 * Ba model Lite phía sau là lưới an toàn: `3.5-flash-lite` và `3.1-flash-lite` có 15 RPM / 500 RPD
 * nên vẫn quét được khi các model trên đã hết quota trong ngày.
 * Hạn mức thực tế của tài khoản: https://ai.dev/rate-limit
 */
const DEFAULT_INVOICE_GEMINI_MODELS = Object.freeze([
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
]);
// Hoá đơn nhiều dòng cần lâu hơn 25s; trần cũ khiến model tốt bị cắt giữa lúc đang đọc đúng.
const DEFAULT_INVOICE_GEMINI_TIMEOUT_MS = 45000;
// Trần cho cả chuỗi model, để một lần quét không kéo dài vô hạn khi mọi model đều lỗi.
const DEFAULT_INVOICE_GEMINI_BUDGET_MS = 90000;

/** Cho phép đổi thứ tự model bằng INVOICE_GEMINI_MODELS mà không phải sửa code. */
function resolveInvoiceModels(explicitModels) {
    const provided = Array.isArray(explicitModels) ? explicitModels : [];
    const normalizedProvided = provided.map((item) => String(item || '').trim()).filter(Boolean);
    if (normalizedProvided.length > 0) return normalizedProvided;

    const fromEnv = String(process.env.INVOICE_GEMINI_MODELS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return fromEnv.length > 0 ? fromEnv : [...DEFAULT_INVOICE_GEMINI_MODELS];
}

/**
 * Giới hạn suy luận nội bộ của model để không vượt trần thời gian.
 * Đo thực tế: bỏ trống cấu hình này khiến gemini-3.5-flash tốn 30–38s cho một hoá đơn.
 * Hai họ model dùng hai tham số khác nhau: 3.x nhận `thinkingLevel`, 2.5.x nhận `thinkingBudget`.
 */
function buildInvoiceThinkingConfig(modelName) {
    return /^gemini-3/.test(String(modelName || ''))
        ? { thinkingLevel: 'LOW' }
        : { thinkingBudget: 0 };
}

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
                generationConfig: {
                    thinkingConfig: buildInvoiceThinkingConfig(modelName),
                },
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

/**
 * Đi lần lượt danh sách model cho tới khi handleResponse xử lý được phản hồi.
 * handleResponse ném lỗi (ví dụ JSON hỏng) cũng được coi là model đó không dùng được
 * và chuyển sang model kế tiếp, thay vì làm cả lần quét thất bại.
 */
async function runInvoiceGeminiLadder({
    apiKey,
    systemPrompt,
    mimeType,
    base64Image,
    fetchImpl = global.fetch,
    models,
    timeoutMs = DEFAULT_INVOICE_GEMINI_TIMEOUT_MS,
    budgetMs = DEFAULT_INVOICE_GEMINI_BUDGET_MS,
    logger = console,
    handleResponse,
}) {
    let lastError = null;
    const startedAt = Date.now();
    const modelList = resolveInvoiceModels(models);

    for (const [modelIndex, modelName] of modelList.entries()) {
        const remainingMs = budgetMs - (Date.now() - startedAt);
        // Model đầu luôn được thử; các model sau chỉ chạy khi còn thời gian trong ngân sách.
        if (modelIndex > 0 && remainingMs <= 0) {
            logger.warn('[scan-invoice] Hết ngân sách thời gian, bỏ qua các model còn lại:', modelList.slice(modelIndex).join(', '));
            break;
        }

        try {
            const response = await callInvoiceGeminiModel({
                apiKey,
                modelName,
                systemPrompt,
                mimeType,
                base64Image,
                fetchImpl,
                timeoutMs: modelIndex === 0 ? timeoutMs : Math.min(timeoutMs, remainingMs),
                logger,
            });
            if (response.ok) {
                try {
                    return await handleResponse(response);
                } catch (parseError) {
                    // Model trả HTTP 200 nhưng nội dung không dùng được: coi như model này lỗi.
                    logger.warn(`[scan-invoice] Model ${modelName} trả về nội dung không đọc được:`, parseError.message);
                    lastError = parseError;
                    continue;
                }
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

/** Giữ hợp đồng cũ: trả về Response thô của model đầu tiên phản hồi thành công. */
async function requestInvoiceGeminiResponse(options) {
    return runInvoiceGeminiLadder({ ...options, handleResponse: (response) => response });
}

async function extractInvoiceItemsWithGemini(options) {
    return runInvoiceGeminiLadder({
        ...options,
        handleResponse: async (response) => parseInvoiceGeminiData(await response.json()),
    });
}

module.exports = {
    DEFAULT_INVOICE_GEMINI_BUDGET_MS,
    DEFAULT_INVOICE_GEMINI_MODELS,
    DEFAULT_INVOICE_GEMINI_TIMEOUT_MS,
    buildInvoiceThinkingConfig,
    callInvoiceGeminiModel,
    resolveInvoiceModels,
    extractInvoiceItemsWithGemini,
    parseInvoiceGeminiData,
    requestInvoiceGeminiResponse,
    runInvoiceGeminiLadder,
};
