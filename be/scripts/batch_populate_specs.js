require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { resolveMongoUri } = require('../config/database');

function generateSpecsAndDescription(prod) {
  const name = prod.name || "";
  const code = prod.code || "";
  const brand = prod.brand || "Chính hãng";
  const type = prod.type || "Thành phần tự động hóa";
  const section = prod.section || "Tủ Điện Điều Khiển";

  let description = "";
  let specsLines = [
    `Hãng sản xuất: ${brand}`,
    `Mã sản phẩm: ${code || "Đang cập nhật"}`,
    `Phân nhóm: ${section}`,
    `Loại thiết bị: ${type}`
  ];

  // Tailored logic by type & name keywords
  const nUpper = name.toUpperCase();
  const cUpper = code.toUpperCase();
  const bUpper = brand.toUpperCase();

  if (nUpper.includes("RELAY NHIỆT") || nUpper.includes("TH-T") || type.toLowerCase().includes("relay nhiệt")) {
    const ampMatch = name.match(/([\d\.]+\s*A)/i);
    const rangeMatch = name.match(/\(([\d\.]+\s*A\s*-\s*[\d\.]+\s*A)\)/i);
    const ampStr = ampMatch ? ampMatch[1] : "";
    const rangeStr = rangeMatch ? rangeMatch[1] : "";

    description = `Relay nhiệt ${brand} ${name} được thiết kế để bảo vệ động cơ điện khỏi các sự cố quá tải và mất pha trong hệ thống công nghiệp và dây chuyền sản xuất. Thiết bị hoạt động dựa trên cơ chế giãn nở thanh kim loại kép cơ học, có núm điều chỉnh dải dòng cắt chính xác và nút reset linh hoạt.`;
    if (rangeStr) specsLines.push(`Dải dòng điều chỉnh: ${rangeStr}`);
    if (ampStr) specsLines.push(`Dòng định mức: ${ampStr}`);
    specsLines.push(`Số cực bảo vệ: 3 cực`);
    specsLines.push(`Tiếp điểm phụ tích hợp: 1NO + 1NC (Chịu dòng 5A)`);
    specsLines.push(`Phương thức lắp đặt: Gắn trực tiếp vào Contactor hoặc lắp thanh DIN rail`);
    specsLines.push(`Tiêu chuẩn chất lượng: IEC 60947-4-1, CE, RoHs`);
  }
  else if (nUpper.includes("RELAY TRUNG GIAN") || nUpper.includes("RELAY 8 CHÂN") || nUpper.includes("RELAY 14 CHÂN") || nUpper.includes("RN2S") || nUpper.includes("RN4S") || nUpper.includes("MY2N") || nUpper.includes("MY4N")) {
    const pinMatch = name.match(/(\d+)\s*chân/i);
    const pinStr = pinMatch ? `${pinMatch[1]} chân` : (nUpper.includes("14") ? "14 chân" : "8 chân");
    const voltMatch = name.match(/(220VAC|24VDC|110VAC|24VAC)/i);
    const voltStr = voltMatch ? voltMatch[1] : "220VAC";

    description = `Relay trung gian ${brand} ${name} là thiết bị chuyển mạch cơ điện nhỏ gọn dùng để cách ly tín hiệu, điều khiển trung gian giữa mạch điều khiển PLC/Bộ vi xử lý và mạch động lực. Sản phẩm đạt tiêu chuẩn chất lượng cao, có đèn LED hiển thị trạng thái cuộn hút và tiếp điểm mạ hợp kim bạc chống ăn mòn.`;
    specsLines.push(`Cấu hình chân: ${pinStr} (${nUpper.includes("14") ? "4 cặp tiếp điểm 4PDT" : "2 cặp tiếp điểm DPDT"})`);
    specsLines.push(`Điện áp cuộn hút (Coil): ${voltStr}`);
    specsLines.push(`Dòng chịu tải tiếp điểm: 5A (250VAC / 30VDC)`);
    specsLines.push(`Thời gian tác động: < 20 ms`);
    specsLines.push(`Đèn báo trạng thái: Có đèn LED tích hợp`);
    specsLines.push(`Tuổi thọ cơ học: > 10.000.000 lần đóng cắt`);
  }
  else if (nUpper.includes("ĐẾ RELAY") || nUpper.includes("SN2S") || nUpper.includes("SN4S") || nUpper.includes("PYF")) {
    const pinMatch = name.match(/(\d+)\s*chân/i);
    const pinStr = pinMatch ? `${pinMatch[1]} chân` : (nUpper.includes("14") ? "14 chân" : "8 chân");

    description = `Đế rơ le ${brand} ${name} chuyên dùng để cắm lắp Relay trung gian hoặc Relay thời gian lên thanh DIN rail trong tủ điện điều khiển và hệ thống tự động hóa. Vỏ đế được làm bằng nhựa chống cháy Polycarbonate cao cấp, ốc bắt dây vặn chắc chắn đảm bảo tiếp xúc điện tối ưu.`;
    specsLines.push(`Số chân cắm: ${pinStr}`);
    specsLines.push(`Điện áp định mức: 300V AC`);
    specsLines.push(`Dòng định mức: 7A - 10A`);
    specsLines.push(`Phương thức gắn: Cài thanh DIN Rail 35mm hoặc bắt vít cố định`);
    specsLines.push(`Chất liệu vỏ: Nhựa kỹ thuật chống cháy PBT/PC`);
  }
  else if (nUpper.includes("NÚT") || nUpper.includes("CÔNG TẮC") || nUpper.includes("YW1") || nUpper.includes("XB4") || nUpper.includes("XB5") || type.toLowerCase().includes("nút nhấn")) {
    const posMatch = name.match(/(\d+)\s*vị trí/i);
    const posStr = posMatch ? `${posMatch[1]} vị trí` : "";
    const contactMatch = name.match(/(1NO|1NC|2NO|2NC|1NO\+1NC)/i);
    const contactStr = contactMatch ? contactMatch[1] : "1NO";

    description = `Nút nhấn / Công tắc điều khiển ${brand} ${name} được sử dụng rộng rãi trên mặt tủ điện công nghiệp để thao tác khởi động, dừng, chuyển chế độ hoặc dừng khẩn cấp dây chuyền sản xuất. Thân nút bấm chắc chắn, tiếp điểm độ bền cao, hoạt động êm ái và khả năng chống bụi bẩn tốt.`;
    specsLines.push(`Đường kính lỗ khoét mặt tủ: Φ22 mm`);
    if (posStr) specsLines.push(`Chức năng / Số vị trí: Công tắc xoay ${posStr}`);
    specsLines.push(`Cấu hình tiếp điểm tích hợp: ${contactStr}`);
    specsLines.push(`Điện áp / Dòng định mức tiếp điểm: Ui 600V, Ith 10A (AC-15: 240V/3A)`);
    specsLines.push(`Cấp bảo vệ chống bụi nước: IP65 (Mặt trước tủ)`);
    specsLines.push(`Nhiệt độ hoạt động: -25°C đến +55°C`);
  }
  else if (nUpper.includes("CONTACTOR") || nUpper.includes("S-T") || nUpper.includes("LC1D") || type.toLowerCase().includes("contactor")) {
    const ampMatch = name.match(/(S-T\d+|[\d\.]+\s*A)/i);
    const ampStr = ampMatch ? ampMatch[1] : "";
    const coilMatch = name.match(/(AC200V|AC220V|AC380V|DC24V|220V|380V)/i);
    const coilStr = coilMatch ? coilMatch[1] : "AC 220V 50/60Hz";

    description = `Contactor (Khởi động từ) ${brand} ${name} là thiết bị đóng cắt động lực chuyên dùng để điều khiển vận hành động cơ, máy bơm, quạt gió và tải công suất lớn trong hệ thống sản xuất công nghiệp. Thiết bị có khả năng dập hồ quang điện nhanh, chịu được tần số đóng cắt cao.`;
    if (ampStr) specsLines.push(`Model / Khả năng tải: ${ampStr}`);
    specsLines.push(`Điện áp cuộn hút (Coil): ${coilStr}`);
    specsLines.push(`Số cực động lực: 3 cực (3 Phase main contacts)`);
    specsLines.push(`Tiếp điểm phụ tích hợp: 1NO hoặc 1NC (tùy phiên bản)`);
    specsLines.push(`Độ bền cơ học: > 10.000.000 lần thao tác`);
    specsLines.push(`Tiêu chuẩn kỹ thuật: IEC/EN 60947-4-1`);
  }
  else if (nUpper.includes("APTOMAT") || nUpper.includes("MCCB") || nUpper.includes("MCB") || nUpper.includes("CB ") || nUpper.includes("NF") || nUpper.includes("BH-D")) {
    const ampMatch = name.match(/(\d+\s*A)/i);
    const poleMatch = name.match(/(\d\s*P|\d\s*cực)/i);
    const ampStr = ampMatch ? ampMatch[1] : "";
    const poleStr = poleMatch ? poleMatch[1] : "3P (3 Pha)";

    description = `Aptomat (Cầu dao tự động) ${brand} ${name} đóng vai trò bảo vệ ngắn mạch và quá tải cho nguồn điện tổng, nhánh động cơ hoặc tủ điều khiển công nghiệp. Với bộ vỏ cách điện cao cấp, dải đóng cắt chính xác và dòng cắt ngắn mạch cao, sản phẩm đảm bảo an toàn tuyệt đối cho người sử dụng và thiết bị.`;
    specsLines.push(`Số cực bảo vệ: ${poleStr}`);
    if (ampStr) specsLines.push(`Dòng định mức (In): ${ampStr}`);
    specsLines.push(`Điện áp định mức (Ue): 380V - 415V AC`);
    specsLines.push(`Dòng cắt ngắn mạch (Icu): 5kA - 25kA (tùy thuộc vào model)`);
    specsLines.push(`Cơ chế bảo vệ: Từ nhiệt (Thermal-Magnetic)`);
    specsLines.push(`Tiêu chuẩn sản xuất: IEC 60947-2 / IEC 60898`);
  }
  else if (nUpper.includes("PLC") || nUpper.includes("MODULE") || nUpper.includes("S7-") || nUpper.includes("SM12") || nUpper.includes("SB12")) {
    description = `Bộ điều khiển lập trình PLC / Module mở rộng ${brand} ${name} là bộ não trung tâm của hệ thống tự động hóa nhà máy. Sản phẩm xử lý tín hiệu đầu vào/đầu ra nhanh chóng, hỗ trợ các chuẩn truyền thông công nghiệp và độ tin cậy vận hành 24/7 cực cao.`;
    specsLines.push(`Dòng sản phẩm: ${name}`);
    specsLines.push(`Mã đặt hàng (Order Code): ${code}`);
    specsLines.push(`Nguồn cấp: 24V DC hoặc 220V AC`);
    specsLines.push(`Chuẩn truyền thông: PROFINET / Ethernet / RS485 Modbus`);
    specsLines.push(`Nhiệt độ môi trường vận hành: -20°C đến +60°C`);
  }
  else if (nUpper.includes("LOADCELL") || nUpper.includes("CẢM BIẾN LỰC") || nUpper.includes("ĐỒNG HỒ CẢM BIẾN") || nUpper.includes("AD2015") || nUpper.includes("Z6F")) {
    description = `Cảm biến lực Loadcell / Đồng hồ hiển thị lực ${brand} ${name} là thiết bị đo lường khối lượng độ chính xác cao chuyên dùng cho cân xi măng, cân cốt liệu, cân nước và cân phụ gia trong hệ thống cân định lượng công nghiệp. Sản phẩm làm bằng thép hợp kim hoặc inox chống ăn mòn, hoạt động bền bỉ trong môi trường va đập và bụi bẩn.`;
    specsLines.push(`Tên / Model thiết bị: ${name}`);
    specsLines.push(`Mã model: ${code}`);
    specsLines.push(`Độ chính xác: Cấp C3 (theo tiêu chuẩn OIML R60)`);
    specsLines.push(`Tín hiệu ngõ ra: 2.0mV/V ±0.1% hoặc hiển thị số LED`);
    specsLines.push(`Cấp bảo vệ môi trường: IP67 / IP68 (Chống nước và bụi công nghiệp)`);
    specsLines.push(`Tải trọng an toàn quá tải: 150% R.C`);
  }
  else if (nUpper.includes("BIẾN TẦN") || nUpper.includes("INVERTER") || nUpper.includes("FR500") || nUpper.includes("ATV") || nUpper.includes("G120")) {
    const kwMatch = name.match(/([\d\.]+\s*kW)/i);
    const kwStr = kwMatch ? kwMatch[1] : "";

    description = `Biến tần công nghiệp ${brand} ${name} dùng để điều khiển tốc độ quay của động cơ điện, giúp tối ưu hóa công suất, tiết kiệm năng lượng điện tiêu thụ và bảo vệ cơ khí khi khởi động êm cho các cụm băng tải, vít tải xi măng, cối trộn.`;
    if (kwStr) specsLines.push(`Công suất động cơ tương thích: ${kwStr}`);
    specsLines.push(`Điện áp ngõ vào: 3 Pha 380V - 480V AC 50/60Hz`);
    specsLines.push(`Điện áp ngõ ra: 3 Pha 0V - Điện áp vào, Tần số 0 - 500Hz`);
    specsLines.push(`Chế độ điều khiển: V/F Control, Vector Control không cảm biến (SVC)`);
    specsLines.push(`Khả năng chịu quá tải: 150% trong 60 giây`);
    specsLines.push(`Hỗ trợ truyền thông: RS485 (Modbus RTU), CANopen`);
  }
  else {
    description = `Thiết bị tự động hóa ${brand} ${name} (Mã hiệu: ${code}) là sản phẩm phụ kiện chính hãng chất lượng cao, đáp ứng các tiêu chuẩn kỹ thuật nghiêm ngặt dành cho tủ điện điều khiển và dây chuyền công nghiệp. Sản phẩm có độ bền cơ học cao, lắp đặt dễ dàng và vận hành ổn định lâu dài.`;
    specsLines.push(`Tên sản phẩm: ${name}`);
    specsLines.push(`Mã sản phẩm: ${code}`);
    specsLines.push(`Thương hiệu: ${brand}`);
    specsLines.push(`Môi trường làm việc: Công nghiệp / Nhà máy sản xuất`);
    specsLines.push(`Tiêu chuẩn chứng nhận: CE, ISO 9001, RoHs`);
  }

  return {
    description: description.trim(),
    specifications: specsLines.join("\n").trim()
  };
}

async function main() {
  const mongoUri = resolveMongoUri();
  console.log("⚡ Đang kết nối MongoDB...");
  await mongoose.connect(mongoUri);
  console.log(`✅ Đã kết nối DB: ${mongoose.connection.name}`);

  try {
    const products = await Product.find({
      $or: [
        { description: { $in: [null, ""] } },
        { specifications: { $in: [null, ""] } }
      ]
    }).select('_id name code brand type section description specifications').lean();

    console.log(`📦 Tìm thấy ${products.length} sản phẩm cần bổ sung dữ liệu.`);

    let successCount = 0;
    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      const data = generateSpecsAndDescription(prod);

      await Product.updateOne(
        { _id: prod._id },
        {
          $set: {
            description: data.description,
            specifications: data.specifications
          }
        }
      );

      successCount++;
      if ((i + 1) % 50 === 0 || i === products.length - 1) {
        console.log(`  ✅ [${i + 1}/${products.length}] Cập nhật xong ${successCount} sản phẩm...`);
      }
    }

    console.log("\n==========================================");
    console.log(`🎉 HOÀN THÀNH BỔ SUNG DỮ LIỆU TOÀN BỘ SẢN PHẨM!`);
    console.log(`✅ Cập nhật thành công: ${successCount}/${products.length} sản phẩm.`);
    console.log("==========================================\n");

  } catch (err) {
    console.error("❌ Lỗi hệ thống:", err);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Đã ngắt kết nối MongoDB.");
  }
}

main();
