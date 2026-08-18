require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { resolveMongoUri } = require('../config/database');

function cleanDescriptionAndSpecs(prod) {
  const name = (prod.name || "").trim();
  const code = (prod.code || "").trim();
  let brand = (prod.brand || "").trim();
  let type = (prod.type || "").trim();
  let section = (prod.section || "").trim();

  if (!brand || brand === "Chưa rõ" || brand === "Khác") brand = "Đang cập nhật";
  if (!type || type === "Chưa phân loại") type = "Linh kiện & Phụ kiện công nghiệp";
  if (!section || section === "Chưa phân loại") section = "Hệ thống tủ điện & Tự động hóa";

  const nUpper = name.toUpperCase();
  const cUpper = code.toUpperCase();

  let description = "";
  const specsMap = new Map();

  // Standard initial fields
  specsMap.set("Mã sản phẩm", code || "Đang cập nhật");
  specsMap.set("Thương hiệu", brand);
  specsMap.set("Phân nhóm", section);
  specsMap.set("Loại thiết bị", type);

  // 1. CÁP ĐIỆN & DÂY DẪN (CVV, CXV, Cu/PVC/PVC, 300/500V...)
  if (nUpper.includes("CÁP") || nUpper.includes("DÂY") || nUpper.includes("CVV") || nUpper.includes("CXV") || nUpper.includes("300/500V")) {
    description = `${name} (Mã SP: ${code || "N/A"}) là cáp điều khiển/dây dẫn điện tiêu chuẩn dùng cho tủ điện và hệ thống tự động hóa công nghiệp. Cáp có khả năng truyền tải tín hiệu và nguồn điện ổn định, vỏ bọc cách điện cao cấp chịu ma sát và chống nước/dầu mỡ tốt trong môi trường công nghiệp.`;

    const voltMatch = name.match(/(\d+\/\d+V)/i);
    const specMatch = name.match(/([\d\.]+\s*×\s*[\d\.]+\s*mm2|[\d\.]+\s*x\s*[\d\.]+\s*mm2)/i);
    
    specsMap.set("Quy cách cáp", specMatch ? specMatch[1] : "Theo tiêu chuẩn nhà sản xuất");
    specsMap.set("Cấp điện áp", voltMatch ? voltMatch[1] : "300/500V");
    specsMap.set("Lõi dẫn điện", "Đồng nguyên chất (Cu)");
    specsMap.set("Lớp cách điện / Vỏ bọc", "PVC / PVC cách điện chịu lực");
    specsMap.set("Môi trường sử dụng", "Tủ điện công nghiệp, Dây chuyền sản xuất, Nhà xưởng");
  }
  // 2. RELAY NHIỆT (TH-T...)
  else if (nUpper.includes("RELAY NHIỆT") || nUpper.includes("TH-T")) {
    const ampMatch = name.match(/([\d\.]+\s*A)/i);
    const rangeMatch = name.match(/\(([\d\.]+\s*A\s*-\s*[\d\.]+\s*A)\)/i);

    description = `Relay nhiệt ${brand !== "Đang cập nhật" ? brand : ""} ${name} được thiết kế để bảo vệ động cơ điện khỏi sự cố quá tải và mất pha. Thiết bị sử dụng cơ chế thanh kim loại kép với dải chỉnh dòng cắt linh hoạt và nút reset an toàn.`;
    if (rangeMatch) specsMap.set("Dải dòng điều chỉnh", rangeMatch[1]);
    if (ampMatch) specsMap.set("Dòng định mức", ampMatch[1]);
    specsMap.set("Số cực bảo vệ", "3 cực");
    specsMap.set("Tiếp điểm phụ tích hợp", "1NO + 1NC (5A)");
    specsMap.set("Cách lắp đặt", "Gắn vào Contactor hoặc thanh DIN Rail");
  }
  // 3. RELAY TRUNG GIAN & ĐẾ RELAY
  else if (nUpper.includes("RELAY") || nUpper.includes("ĐẾ RELAY") || nUpper.includes("RN2S") || nUpper.includes("RN4S") || nUpper.includes("SN2S") || nUpper.includes("SN4S")) {
    const pinMatch = name.match(/(\d+)\s*chân/i);
    const pinStr = pinMatch ? `${pinMatch[1]} chân` : (nUpper.includes("14") ? "14 chân" : "8 chân");

    if (nUpper.includes("ĐẾ")) {
      description = `Đế rơ le ${brand !== "Đang cập nhật" ? brand : ""} ${name} dùng cắm rơ le trung gian/timer lên thanh DIN rail trong tủ điện công nghiệp. Vỏ nhựa Polycarbonate chống cháy cao cấp, cọc đấu dây chắc chắn.`;
      specsMap.set("Số chân cắm", pinStr);
      specsMap.set("Điện áp định mức", "300V AC / 10A");
      specsMap.set("Lắp đặt", "Thanh DIN Rail 35mm hoặc bắt vít");
    } else {
      description = `Relay trung gian ${brand !== "Đang cập nhật" ? brand : ""} ${name} dùng chuyển mạch tín hiệu điều khiển cách ly giữa PLC và thiết bị động lực. Tích hợp đèn LED báo trạng thái cuộn hút, độ bền đóng cắt cao.`;
      specsMap.set("Cấu hình chân / Tiếp điểm", `${pinStr} (${nUpper.includes("14") ? "4PDT" : "DPDT"})`);
      specsMap.set("Điện áp cuộn hút", name.includes("220") ? "220V AC" : (name.includes("24") ? "24V DC" : "220V AC"));
      specsMap.set("Dòng chịu tải tiếp điểm", "5A (250VAC)");
    }
  }
  // 4. NÚT NHẤN / CÔNG TẮC / ĐÈN BÁO
  else if (nUpper.includes("NÚT") || nUpper.includes("CÔNG TẮC") || nUpper.includes("ĐÈN") || nUpper.includes("YW1") || nUpper.includes("GW1")) {
    description = `Sản phẩm ${name} (Mã: ${code || "N/A"}) dùng cho mặt tủ điện điều khiển công nghiệp và dây chuyền sản xuất. Thân vỏ nhựa/kim loại cứng cáp, thao tác dứt khoát, độ bền cơ học cao.`;
    specsMap.set("Đường kính lắp đặt", "Φ22 mm");
    if (nUpper.includes("NC")) specsMap.set("Tiếp điểm phụ", "1NC");
    else if (nUpper.includes("2NO")) specsMap.set("Tiếp điểm phụ", "2NO");
    else specsMap.set("Tiếp điểm phụ", "1NO");
    specsMap.set("Cấp bảo vệ", "IP65 (Chống bụi nước mặt trước tủ)");
  }
  // 5. CÁC THIẾT BỊ KHÁC
  else {
    description = `Sản phẩm ${name} (Mã hiệu: ${code || "Đang cập nhật"}) là thiết bị/linh kiện công nghiệp chính hãng chất lượng cao dành cho tủ điện điều khiển và hệ thống tự động hóa. Đảm bảo độ bền cơ học cao và vận hành ổn định.`;
    specsMap.set("Tên sản phẩm", name);
    specsMap.set("Ứng dụng", "Tủ điện công nghiệp & Dây chuyền sản xuất");
    specsMap.set("Tiêu chuẩn", "CE, ISO 9001, RoHs");
  }

  // Build clean non-duplicated specs string
  const specLines = [];
  specsMap.forEach((val, key) => {
    if (val && String(val).trim()) {
      specLines.push(`${key}: ${String(val).trim()}`);
    }
  });

  return {
    description: description.trim(),
    specifications: specLines.join("\n").trim()
  };
}

async function main() {
  const mongoUri = resolveMongoUri();
  console.log("⚡ Đang kết nối MongoDB...");
  await mongoose.connect(mongoUri);
  console.log(`✅ Đã kết nối DB: ${mongoose.connection.name}`);

  try {
    // Lay tat ca san pham co chua van ban bi trung ngat hoac desc co "Thiet bi tu dong hoa Chua ro"
    const products = await Product.find({}).select('_id name code brand type section description specifications').lean();

    console.log(`📦 Đang làm sạch dữ liệu cho ${products.length} sản phẩm...`);

    let updatedCount = 0;
    for (let i = 0; i < products.length; i++) {
      const prod = products[i];

      // Chi lam sach nhung sp khong phai du lieu goc tu Siemens Datasheet (sp tu Siemens co hon 10 dòng chi tiet)
      const isSiemensDatasheet = prod.specifications && prod.specifications.includes("CPU 1214C") || prod.specifications.includes("Framework version") || prod.specifications.includes("STEP 7 V20");

      if (isSiemensDatasheet) {
        continue;
      }

      const cleaned = cleanDescriptionAndSpecs(prod);

      await Product.updateOne(
        { _id: prod._id },
        {
          $set: {
            description: cleaned.description,
            specifications: cleaned.specifications
          }
        }
      );

      updatedCount++;
    }

    console.log("\n==========================================");
    console.log(`🎉 ĐÃ SỬA VÀ LÀM SẠCH HOÀN TOÀN BỘ CÁC TRÙNG LẶP!`);
    console.log(`✅ Đã chuẩn hóa lại: ${updatedCount} sản phẩm.`);
    console.log("==========================================\n");

  } catch (err) {
    console.error("❌ Lỗi hệ thống:", err);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Đã ngắt kết nối MongoDB.");
  }
}

main();
