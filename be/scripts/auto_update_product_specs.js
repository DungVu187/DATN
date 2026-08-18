require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { resolveMongoUri } = require('../config/database');

// Help & CLI Options parsing
const args = process.argv.slice(2);
const isForce = args.includes('--force');
const isDryRun = args.includes('--dry-run');

let limit = 0;
const limitIdx = args.indexOf('--limit');
if (limitIdx !== -1 && args[limitIdx + 1]) {
  limit = parseInt(args[limitIdx + 1], 10) || 0;
}

let targetId = null;
const idIdx = args.indexOf('--id');
if (idIdx !== -1 && args[idIdx + 1]) {
  targetId = args[idIdx + 1].trim();
}

let delayMs = 1000; // 1s delay across rotating models
const delayIdx = args.indexOf('--delay');
if (delayIdx !== -1 && args[delayIdx + 1]) {
  delayMs = parseInt(args[delayIdx + 1], 10) || 1000;
}

const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-pro-preview"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWaitTimeFrom429(errMsg) {
  const match = String(errMsg || "").match(/retry in ([\d\.]+)s/i);
  if (match && match[1]) {
    const secs = parseFloat(match[1]);
    if (!isNaN(secs) && secs > 0) {
      return Math.ceil(secs * 1000) + 1000;
    }
  }
  return 15000; // 15s backoff if all models exhausted
}

function extractJsonObject(rawText) {
  if (!rawText) return null;
  
  // Try direct JSON parse
  try {
    return JSON.parse(rawText);
  } catch (_) {}

  // Match ```json ... ``` codeblock
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch && jsonMatch[1]) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (_) {}
  }

  // Fallback match first { ... } block
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  return null;
}

function formatSpecsToString(specs) {
  if (!specs) return "";
  if (typeof specs === "string") return specs.trim();
  if (typeof specs === "object") {
    if (Array.isArray(specs)) {
      return specs.map(item => typeof item === "object" ? JSON.stringify(item) : String(item)).join("\n");
    }
    return Object.entries(specs)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("\n");
  }
  return String(specs).trim();
}

async function fetchProductSpecsFromGoogle(product, apiKey, modelName = "gemini-2.5-flash") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = `Bạn là chuyên gia thiết bị điện và tự động hóa công nghiệp. Hãy tìm kiếm thông tin chính thức từ nhà sản xuất cho sản phẩm sau:
Thương hiệu (Brand): ${product.brand || "N/A"}
Tên sản phẩm: ${product.name || "N/A"}
Mã sản phẩm (Model Code): ${product.code || "N/A"}
Loại (Type): ${product.type || "N/A"}
Phân nhóm (Section): ${product.section || "N/A"}

Nhiệm vụ: Sử dụng Google Search để tra cứu chính xác catalogue / datasheet / thông số kỹ thuật của đúng mã sản phẩm này từ hãng sản xuất.

Yêu cầu trả về DUY NHẤT 1 chuỗi JSON hợp lệ theo cấu trúc sau (không thêm văn bản ngoài JSON):
{
  "description": "Mô tả tổng quan sản phẩm bằng tiếng Việt dưới dạng một chuỗi văn bản (2-4 câu chuyên nghiệp, nêu rõ công dụng, tính năng nổi bật và ứng dụng thực tế trong hệ thống tự động hóa / dây chuyền sản xuất công nghiệp)...",
  "specifications": "Thông số kỹ thuật chi tiết dưới dạng MỘT CHUỖI VĂN BẢN DUY NHẤT (mỗi thông số 1 dòng Key: Value ngắn gọn, chính xác bằng tiếng Việt hoặc thuật ngữ chuyên ngành chuẩn)"
}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    tools: [
      { googleSearch: {} }
    ],
    generationConfig: {
      temperature: 0.1
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${errData?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text).join("");
  
  const parsed = extractJsonObject(text);
  if (!parsed || (!parsed.description && !parsed.specifications)) {
    throw new Error("Không thể bóc tách JSON dữ liệu từ kết quả trả về của Gemini.");
  }

  return {
    description: formatSpecsToString(parsed.description),
    specifications: formatSpecsToString(parsed.specifications)
  };
}

function getApiKeys() {
  const keys = [];
  const addKey = (str) => {
    if (!str) return;
    String(str).split(',').forEach(k => {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) {
        keys.push(trimmed);
      }
    });
  };

  addKey(process.env.GEMINI_API_KEYS);
  addKey(process.env.GEMINI_API_KEY);
  for (let i = 1; i <= 20; i++) {
    addKey(process.env[`GEMINI_API_KEY_${i}`]);
  }
  return keys;
}

async function main() {
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    console.error("❌ ERROR: Chưa cấu hình GEMINI_API_KEY trong file .env!");
    process.exit(1);
  }

  const mongoUri = resolveMongoUri();
  console.log("⚡ Đang kết nối MongoDB...");
  await mongoose.connect(mongoUri);
  console.log(`✅ Đã kết nối DB: ${mongoose.connection.name}`);

  try {
    let query = {};
    if (targetId) {
      query._id = targetId;
    } else if (!isForce) {
      // Mặc định chỉ cập nhật những sp chưa có mô tả hoặc chưa có thông số kỹ thuật
      query.$or = [
        { description: { $in: [null, ""] } },
        { specifications: { $in: [null, ""] } }
      ];
    }

    let productsQuery = Product.find(query).select('_id name code brand type section description specifications');
    if (limit > 0) {
      productsQuery = productsQuery.limit(limit);
    }

    const products = await productsQuery.lean();
    console.log(`📦 Tìm thấy ${products.length} sản phẩm cần xử lý.`);
    console.log(`🔑 Số lượng API Keys khả dụng: ${apiKeys.length}`);
    console.log(`🚀 Sử dụng luân phiên các model: ${GEMINI_MODELS.join(", ")}`);
    if (isDryRun) console.log("🔍 [DRY-RUN MODE] Không ghi dữ liệu vào DB.");
    if (isForce) console.log("🔄 [FORCE MODE] Ghi đè cả sản phẩm đã có dữ liệu.");

    let successCount = 0;
    let failCount = 0;
    let currentKeyIdx = 0;
    let currentModelIdx = 0;

    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      const seqStr = `[${i + 1}/${products.length}]`;
      const labelStr = `${prod.name} | Mã: ${prod.code || "N/A"} | Hãng: ${prod.brand || "N/A"}`;

      let specsData = null;
      let totalAttempts = 0;
      const maxAttempts = apiKeys.length * GEMINI_MODELS.length * 2;

      while (totalAttempts < maxAttempts) {
        const apiKey = apiKeys[currentKeyIdx];
        const modelName = GEMINI_MODELS[currentModelIdx];
        totalAttempts++;

        try {
          console.log(`\n⏳ ${seqStr} [Key #${currentKeyIdx + 1} | Model: ${modelName}] Tra cứu: "${labelStr}"...`);
          specsData = await fetchProductSpecsFromGoogle(prod, apiKey, modelName);
          // Rotate key and model after success
          currentKeyIdx = (currentKeyIdx + 1) % apiKeys.length;
          currentModelIdx = (currentModelIdx + 1) % GEMINI_MODELS.length;
          break;
        } catch (err) {
          const isRateLimit = err.message.includes("429") || err.message.includes("Quota exceeded");
          console.warn(`  ⚠️ [Key #${currentKeyIdx + 1} | ${modelName}] Báo lỗi: ${err.message}`);

          // Switch key and model
          currentKeyIdx = (currentKeyIdx + 1) % apiKeys.length;
          currentModelIdx = (currentModelIdx + 1) % GEMINI_MODELS.length;

          if (isRateLimit) {
            if (totalAttempts % (apiKeys.length * GEMINI_MODELS.length) === 0) {
              const waitTime = parseWaitTimeFrom429(err.message);
              console.log(`  ⏸️ Tất cả API Keys & Models đều chạm giới hạn tạm thời. Tạm dừng ${Math.ceil(waitTime / 1000)}s...`);
              await sleep(waitTime);
            } else {
              await sleep(400);
            }
          } else {
            await sleep(800);
          }
        }
      }

      if (!specsData || (!specsData.description && !specsData.specifications)) {
        console.error(`  ❌ Không thể lấy dữ liệu cho sản phẩm ID: ${prod._id}`);
        failCount++;
        continue;
      }

      console.log(`  📝 Mô tả: ${specsData.description.slice(0, 100)}...`);
      console.log(`  📊 Thông số (${specsData.specifications.split('\n').length} dòng): ${specsData.specifications.slice(0, 120).replace(/\n/g, ' ')}...`);

      if (!isDryRun) {
        await Product.updateOne(
          { _id: prod._id },
          {
            $set: {
              description: specsData.description,
              specifications: specsData.specifications
            }
          }
        );
        console.log(`  ✅ Đã lưu thành công vào MongoDB!`);
      } else {
        console.log(`  🔍 [DRY-RUN] Bỏ qua bước lưu DB.`);
      }

      successCount++;

      // Tránh vượt quá rate limit API
      if (i < products.length - 1) {
        await sleep(delayMs);
      }
    }

    console.log("\n==========================================");
    console.log(`🎉 HOÀN THÀNH QUÁ TRÌNH TỰ ĐỘNG CẬP NHẬT!`);
    console.log(`✅ Thành công: ${successCount}/${products.length}`);
    if (failCount > 0) {
      console.log(`❌ Thất bại: ${failCount}/${products.length}`);
    }
    console.log("==========================================\n");

  } catch (err) {
    console.error("❌ Lỗi hệ thống:", err);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Đã ngắt kết nối MongoDB.");
  }
}

main();
