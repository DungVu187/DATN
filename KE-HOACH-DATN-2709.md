# KẾ HOẠCH ĐỒ ÁN TỐT NGHIỆP — Vũ Đức Dũng — chốt ngày 06/09/2026

> File này là bản khảo sát hiện trạng + lộ trình tới hạn nộp. Mọi AI agent làm việc trong repo
> (Codex, Antigravity, Claude) nên đọc file này cùng với `AGENTS.md` trước khi bắt tay vào việc.

---

## 0. Mốc thời gian thực tế

| Mốc | Ngày | Ghi chú |
|-----|------|---------|
| Hôm nay | **06/09/2026** (Chủ nhật) | Ngày nộp tiến độ tuần theo yêu cầu của thầy |
| **Hạn thực tế phải xong** | **~20/09/2026** | Xem giải thích bên dưới |
| Hạn nộp chính thức | **27/09/2026** | Quyển + sản phẩm phải sẵn sàng trình bày |

**Vì sao hạn thực tế là 20/9 chứ không phải 27/9:** trong buổi trao đổi, thầy nói rõ *"giáo viên
phản biện, giáo viên hướng dẫn họ phải nhập điểm lên hệ thống trước khi hội đồng diễn ra... nên
họ không kịp xem những cái chúng ta thay đổi, bổ sung khi trình bày lên hội đồng"*. Điểm hướng dẫn
và điểm phản biện được chấm **trên quyển đã nộp**, không phải trên bản sửa sau. Vậy nên mọi thứ
phải hoàn thiện **trước một tuần**, tuần cuối chỉ để dự phòng.

→ **Còn 14 ngày làm việc thật.**

---

## 1. Hiện trạng sản phẩm (repo `NovaEcomWeb`)

### 1.1 Đã có và chạy được

| Nhóm | Chi tiết |
|------|----------|
| Storefront (`fe/`) | Danh sách/lọc/chi tiết sản phẩm, giỏ hàng, đặt hàng, tài khoản, theo dõi đơn |
| Thanh toán | **SePay** — `be/services/sepay.js`, `sepayOrderExpiry.js`, `controllers/payments.js`, `components/payment.js` |
| Quản trị (`ad/`) | Sản phẩm + biến thể, loại/thương hiệu, đơn bán, đơn nhập (`iporder`), đơn xuất (`eporder`), khách hàng, phân quyền, quản lý nội dung trang chủ, chính sách |
| Nhật ký | `storagehistory` (lịch sử kho), `activitylog` (lịch sử thao tác) |
| Dashboard | `be/services/dashboardService.js` + `ad/src/components/dashboard.jsx` — doanh thu theo ngày, đơn theo trạng thái, khách mới, đơn treo >2h, sản phẩm sắp hết hàng, so sánh % kỳ trước |
| AI hóa đơn | `productInvoiceGemini.js` → `productInvoicePrompt.js` (15KB prompt) → `productInvoiceMatching.js` (15KB đối sánh) → `invoiceScanFileLifecycle.js` |
| Chatbot (mới, đang làm) | `services/chatIntent.js` (11 intent, phân loại không cần gọi API), `chatContext.js` (grounding từ CSDL: sản phẩm, chính sách, sản phẩm tương tự, hành vi gần đây), `geminiChat.js`, `controllers/chat.js` |
| Theo dõi hành vi (mới) | `models/customerbehavior.js` — 5 loại sự kiện (`view_product`, `search_product`, `click_product`, `add_to_cart`, `start_checkout`), TTL 90 ngày |
| Kiểm thử | `be/` Jest (cần MongoDB local ở `EcomTest`), `fe/`+`ad/` Vitest + jsdom |

### 1.2 Thiếu — và đây là chỗ mất điểm nặng nhất

**🔴 Module DỰ BÁO CÓ GIẢI THÍCH — chưa có một dòng code nào.**

Đây là thứ thầy nhắc đi nhắc lại nhiều nhất trong cả hai transcript. Nguyên văn:

> *"Cái dữ liệu trong cơ sở dữ liệu của bạn, từ những hàng nhập hàng xuất, hàng mua ở đâu nguồn nào,
> thời gian nào mua những cái gì, xu hướng ra sao thì bạn sẽ biết được là dự báo cho xu hướng tới
> bạn nhập hàng gì... Mà phân phối ở khu vực nào **bạn phải có giải thích** nhé."*

> *"Nó đưa ra dự báo nhưng phải giải thích được tại sao... ví dụ tỉ lệ này nó bảo là 80% 90% thì
> nó phải giải thích được tại sao cái tỷ lệ phần trăm đó. Thế còn 10% kia, 20% kia là lý do gì.
> Và **cái quyết định cuối cùng vẫn là con người**."*

> *"Đấy nghiên cứu tập trung cả hai cái mới nghiên cứu đây. **Cái dự báo kia là cái mà quan tâm cho
> người nhập hàng bán**, hoặc là mấy cái mà tôi vừa hướng dẫn rồi đấy, **cái kia cho người khách hàng**
> [= chatbot]."*

Thầy chấm hai "cái mới nghiên cứu": **dự báo** (phía quản trị) và **chatbot có grounding** (phía khách hàng).
Chatbot đang làm dở — tốt. Dự báo là con số 0.

Thầy cũng nói thẳng rằng riêng phần quét hóa đơn **không đủ để tính là đóng góp nghiên cứu**:

> *"Cái đóng góp của người thực hiện cái này là rất nhỏ thôi đúng không? Bởi vì là công cụ nó làm
> hết rồi... người ta ghi nhận là bạn có nghĩ tới việc hỗ trợ cho người nhập liệu cho nó nhanh thôi."*

Nghĩa là: nếu ra hội đồng mà điểm nhấn AI duy nhất là "gọi Gemini quét hóa đơn", đó là điểm yếu
đã được báo trước.

**🟡 Các điểm nhỏ hơn cần kiểm tra:**

- **Kiến trúc bảng tạm cho luồng hóa đơn.** Thầy mô tả rất cụ thể kiến trúc ông muốn thấy:
  bảng tạm 1 (kết quả AI quét) → module đối sánh với CSDL thật → bảng tạm 3 (các dòng có vấn đề,
  bôi đỏ trên UI) → người dùng sửa → bảng tạm sửa → **chỉ khi bấm đồng ý mới ghi vào CSDL gốc**.
  Lý do ông đưa ra: *"chứ đẩy luôn vào cái này cái không undo được là chết ngay."*
  → Cần đối chiếu `productInvoiceMatching.js` xem luồng thực tế có đúng vậy không; nếu có thì
  **phải vẽ và mô tả đúng theo ngôn ngữ đó** trong quyển.
- **Kết xuất báo cáo / thống kê xuất file.** Thầy có hỏi ở phút 00:57. Cần xác nhận đã có chưa.
- `ADMIN_FULL_ACCESS = true` trong `middlewares/auth.js` — admin đang full quyền, phân quyền chi
  tiết chưa bật. Nếu hội đồng hỏi "phân quyền hoạt động thế nào" thì đây là câu hỏi khó.

---

## 2. Hiện trạng quyển báo cáo

> **FILE BÁO CÁO CHÍNH THỨC — sửa xuyên suốt, và là bản mang đi nộp:**
> ```
> D:\Đồ án tốt nghiệp\VUDUCDUNG_BÁO CÁO ĐỒ ÁN TỐT NGHIỆP.docx
> ```
> Mọi chỉnh sửa phải thực hiện trên đúng file này. Các bản `.docx` trong
> `wdata/chapter2-review-copies/` chỉ là **bản chụp cũ để đối chiếu**, không phải bản đang dùng.

Số liệu dưới đây khảo sát từ bản chụp ngày 30/08 trong `wdata/chapter2-review-copies/`.

**Số liệu:** ~69 trang phần chính, 3 chương, 18 hình, 24 bảng trong thân bài.
Phân bổ: Chương 1 ≈ 9 trang · **Chương 2 ≈ 39 trang** · **Chương 3 ≈ 14 trang**.

Khung sườn tốt, văn phong ổn. Nhưng **bản này chưa áp dụng phản hồi của thầy trong buổi soi quyển**
— transcript và file docx cùng ngày 30/08, và cấu trúc hiện tại vẫn y nguyên những chỗ thầy yêu cầu sửa.

### 2.1 Bảng đối chiếu: thầy yêu cầu gì → phải làm gì

| # | Thầy nói | Hiện trạng | Việc phải làm |
|---|----------|------------|---------------|
| 1 | *"Đánh giá... phân tích rồi phải đánh giá được chứ mới đi khảo sát mà đã đánh giá... Bạn đưa nó vào chỗ đề xuất này... về kia kìa bắt đầu sang đoạn phân tích thiết kế hệ thống"* | `1.3 Đánh giá vấn đề nghiệp vụ` và `1.4 Đề xuất hệ thống Nova` đang nằm ở Chương 1 | **Chuyển 1.3 + 1.4 lên đầu Chương 2.** Chương 1 chỉ còn thu thập thông tin thuần túy |
| 2 | *"Chương khảo sát có đủ chưa: một là nghiệp vụ, hai là yêu cầu, ba là dữ liệu"* | Nghiệp vụ ✓ · Yêu cầu ✗ · Dữ liệu (mẫu biểu) một phần | Bổ sung mục **yêu cầu thu thập được** (yêu cầu của khách hàng, của phía quản trị) và **dữ liệu/mẫu biểu** vào Chương 1 |
| 3 | *"Bạn viết chữ 'quy tắc nghiệp vụ' kia người ta sẽ nhầm với nghiệp vụ bạn khảo sát bên trên"* | `2.1.4 Quy tắc nghiệp vụ` đứng riêng | **Bỏ mục riêng.** Đưa các quy tắc vào phần mô tả tác nhân hoặc vào đặc tả Use Case tương ứng |
| 4 | *"Nhìn cái này nó lại dạng như bạn chỉ nói chức năng... sự kế thừa không thấy... bạn chưa thực sự là hướng đối tượng đâu"*. Ví dụ ông đưa: khách vãng lai → đăng nhập thành admin, hoặc đưa thông tin thanh toán thì thành khách hàng thực thụ | Use Case chỉ liệt kê actor → chức năng | **Vẽ lại 3 biểu đồ Use Case** có quan hệ generalization giữa actor (Khách vãng lai là actor gốc), và `<<include>>` / `<<extend>>` giữa các Use Case |
| 5 | *"Thế còn thiếu cái biểu đồ lớp tổng quát nữa"* — có một biểu đồ lớp tổng thể thể hiện quan hệ giữa các module | Chỉ có biểu đồ lớp **theo từng luồng** (2.6, 2.9, 2.12, 2.15) | **Thêm biểu đồ lớp tổng quát.** Nếu quá lớn: cắt theo cách thầy chỉ — chia làm nhiều trang nối bằng đường chấm chấm, **tuyệt đối không thu nhỏ chữ**. Ông cảnh báo: *"hội đồng họ chỉ nói một câu là 'sơ đồ không đọc được, yêu cầu về làm lại biểu đồ' thế thì thôi hỏng rồi"* |
| 6 | *"Cái biểu đồ triển khai bạn cần về xem lại xem trong UML họ bảo chúng ta nên làm thế nào... nếu biểu đồ triển khai nó sẽ nằm ở sau cùng"* | Không có. `2.5.1 Kiến trúc tổng thể` đang bị dùng thay thế và thầy chỉ ra là đang nói về công nghệ chứ không phải triển khai | **Vẽ Deployment Diagram đúng ký pháp UML** (node, artifact, communication path): browser → server Node/Express → MongoDB → Gemini API → SePay. Đặt ở cuối phần thiết kế |
| 7 | *"Bảng thiết kế vật lý để cài đặt... không nói tên trường là gì, cái nào khóa chính, khóa phụ, kiểu dữ liệu, độ dài bao nhiêu, có quy tắc gì không, chấp nhận null hay không — **không có cái đấy thì bạn mới chỉ phân tích thôi**"* | Chỉ có mô hình logic (Hình 2.17) | **Thêm bảng thiết kế vật lý** cho từng collection: tên trường · kiểu · bắt buộc/null · index · ràng buộc · mô tả. 11 collection trong `be/models/`. Vài bảng chính để trong thân bài, còn lại xuống Phụ lục |
| 8 | *"Trong phân tích thiết kế hệ thống nó không dính gì đến công nghệ đâu... tách mục riêng ra... đưa nó xuống chỗ xây dựng website, chỉ dành một mục rất ngắn thôi — thường là nửa trang là đủ"* | `2.5.1 Kiến trúc tổng thể` + `2.5.2 Phân tích và thiết kế CSDL MongoDB` đang giảng về MongoDB/HTTP trong Chương 2 | **Cắt phần công nghệ khỏi Chương 2, gộp vào `3.1`, viết gọn.** Ông nói thẳng: *"có bạn cho nó đến mười mấy hai chục trang thì nói về cái này không giải quyết được cái gì cả, mà khi check trùng thì nó trùng nhau nhiều lắm"* |
| 9 | *"Chương 3 mà có xây dựng và kiểm thử website rồi thì những thiết kế giao diện trung gian như thế này không cần đâu... Đúng rồi, không cần đâu"* | `2.5.4 Thiết kế giao diện và điều hướng` (~8 trang, tới trang 48) | **Xóa mục 2.5.4.** Ảnh chụp giao diện thật ở Chương 3 thay thế |
| 10 | *"Đặc tả vài cái... khoảng tầm bảy tám cái"*, phần còn lại *"ghi chú một lần bên dưới... đưa xuống phụ lục, người ta sẽ không tính phụ lục"* | 18 Use Case, đặc tả 7 | Giữ 7–8 đặc tả trong thân bài, **viết một câu ghi chú** dạng "các Use Case còn lại được đặc tả tương tự, xem Phụ lục A", rồi **đặc tả nốt 10–11 cái còn lại trong Phụ lục** |
| 11 | *"Bạn chụp giao diện của từng trang dán vào, phía dưới phải mô tả... chụp full. Chứ không thì lại bảo chương trình nghèo nàn thế à"* | Chương 3 chỉ 14 trang | **Mở rộng Chương 3.** Đã có sẵn 12 ảnh trong `wdata/chapter3-assets-20260830/` — dùng luôn, mỗi ảnh kèm 3–5 dòng mô tả |
| 12 | *"Kiểm thử đừng có đạt hết nhé... cứ 100 cái thì qua 97 cái thì hóa ra lập trình siêu đẳng không có bị lỗi gì. **Càng phát hiện được lỗi mình ghi càng chi tiết ra** thì người ta bảo ừ đúng là mình kiểm thử một cách chặt chẽ"* | Cần kiểm tra bảng kết quả kiểm thử hiện tại | **Ghi lỗi thật đã gặp**: mô tả lỗi, cách phát hiện, nguyên nhân, cách sửa, kết quả kiểm thử lại. Đây là mục dễ ăn điểm mà nhiều người tự bỏ |
| 13 | *"Có khi những cái lời cảm ơn khác, tên giáo viên thì chịu sửa. Cuối cùng đưa lên phản biện thầy bảo 'ơ, rõ ràng trên hệ thống ghi giáo viên hướng dẫn là người này mà trong quyển sinh viên viết là người kia?'"* | Cần kiểm tra | **Soát bìa + lời cảm ơn**: tên GVHD, học hàm học vị, tên ngành, mã sinh viên, năm — phải khớp hệ thống |

### 2.2 Vấn đề về độ dày

Thầy chốt: **thân bài 70–80 trang tính đến hết Tài liệu tham khảo**; Phụ lục không tính, muốn dày
bao nhiêu cũng được.

Lưu ý: bản quy định giấy của trường (`2025-phu-luc-quy-dinh-lam-da-kltn_SV.doc`) ghi **"dày từ 30–60
trang, không kể phụ lục"**. Hai con số vênh nhau. Thầy ngồi hội đồng và đã nói rất kỹ về 70–80,
nên bám theo thầy — nhưng **nên hỏi lại thầy một câu trong buổi tiến độ tới** để chắc chắn.

Sau khi cắt (mục 2.5.4 ~8 trang, phần công nghệ trong 2.5.x) và bù (thêm biểu đồ lớp tổng quát,
deployment, bảng vật lý, mở rộng Chương 3, thêm chương/mục về dự báo + chatbot), tổng sẽ rơi
đúng khoảng 75–80 trang.

### 2.3 Chương 3 phải bổ sung mục mới

Hai tính năng nghiên cứu đều chưa có mặt trong quyển:

- `3.2.4 Xây dựng chức năng chatbot tư vấn khách hàng` (grounding từ CSDL + hành vi người dùng)
- `3.2.5 Xây dựng chức năng dự báo hỗ trợ nhập hàng` (kèm phần giải thích kết quả)

Và tương ứng ở Chương 2: đặc tả Use Case + biểu đồ trình tự cho hai luồng này.

---

## 3. Thiết kế đề xuất cho module dự báo

Đây là phần quan trọng nhất còn thiếu. Yêu cầu cốt lõi của thầy: **dựa trên dữ liệu trong CSDL của
mình**, **theo khung thời gian người dùng chọn** (không đọc hết từ đầu đến cuối), **giải thích được
tại sao**, và **quyết định cuối vẫn là con người**.

### 3.1 Nguyên tắc: KHÔNG dùng LLM để dự báo

Dùng thuật toán thống kê tự viết, rồi mới dùng câu chữ để diễn giải. Lý do:

- Thầy đòi **giải thích được từng con số** — LLM không cho bạn cái đó, mà mô hình thống kê thì có.
- Đây mới là *"đóng góp của người thực hiện"* — điều thầy nói phần quét hóa đơn còn thiếu.
- Chạy offline, không phụ thuộc mạng — đúng ý thầy về *"mất mạng thì người ta có thể dùng cục bộ"*.

### 3.2 Nguồn dữ liệu (đã có sẵn trong CSDL)

| Collection | Dùng để |
|-----------|---------|
| `order` | Chuỗi thời gian số lượng bán theo sản phẩm/loại |
| `iporder` | Lịch sử nhập: nhà cung cấp, giá nhập, thời điểm, lead time |
| `eporder` | Lịch sử xuất |
| `storagehistory` | Biến động tồn kho theo thời gian |
| `product` | Tồn hiện tại, loại, thương hiệu |
| `customerbehavior` | Tín hiệu sớm: lượt xem / tìm kiếm / thêm giỏ chưa thành đơn |

### 3.3 Bốn đầu ra đề xuất

1. **Dự báo nhu cầu theo sản phẩm/nhóm** cho kỳ tới (7/30 ngày).
   Kỹ thuật: trung bình trượt có trọng số + hệ số mùa vụ + hệ số xu hướng.
2. **Gợi ý số lượng cần nhập** = nhu cầu dự báo × lead time trung bình của nhà cung cấp
   + tồn an toàn − tồn hiện tại − hàng đang về.
3. **Cảnh báo rủi ro**: sắp hết hàng trước kỳ nhập tiếp theo / hàng tồn đọng lâu không bán.
4. **Tín hiệu sớm từ hành vi**: sản phẩm có lượt xem tăng mạnh nhưng chưa ra đơn.

### 3.4 Lớp giải thích — phần ăn điểm

Mỗi dự báo trả kèm một object `explanation` để hiển thị trên UI:

```
{
  value: 42,                     // số lượng đề xuất nhập
  confidence: 0.78,              // độ tin cậy
  window: "2026-06-01..2026-08-31",   // khung thời gian đã dùng
  sampleSize: 31,                // số đơn làm căn cứ
  factors: [                     // đóng góp của từng yếu tố, cộng lại = 100%
    { name: "Trung bình bán 3 tháng gần nhất", value: 28, weight: 0.55,
      note: "28 chiếc/tháng, ổn định qua 3 tháng" },
    { name: "Hệ số mùa vụ tháng 10", value: "+18%", weight: 0.25,
      note: "Tháng 10 năm trước cao hơn trung bình năm 18%" },
    { name: "Xu hướng tăng", value: "+9%", weight: 0.12,
      note: "3 tháng gần nhất tăng đều 9%/tháng" },
    { name: "Tồn kho hiện tại", value: -15, weight: 0.08,
      note: "Đã còn 15 chiếc trong kho" }
  ],
  uncertainty: [                 // phần 22% còn lại — thầy hỏi đúng chỗ này
    "Chỉ có 31 đơn trong kỳ, mẫu nhỏ",
    "Chưa có dữ liệu cùng kỳ năm ngoái cho sản phẩm này",
    "Một đơn lớn 20 chiếc ngày 12/08 có thể là bất thường, không lặp lại"
  ],
  humanDecision: true            // hệ thống KHÔNG tự tạo đơn nhập
}
```

**Trên UI phải thể hiện rõ ba điều:** biểu đồ đóng góp của từng yếu tố (waterfall/stacked bar),
phần "vì sao không chắc chắn 100%", và một nút *"Tạo đơn nhập từ gợi ý này"* mà người quản trị
phải bấm — hệ thống tuyệt đối không tự động ghi. Đúng câu của thầy: *"quyết định cuối cùng vẫn là
con người."*

### 3.5 Vị trí trong code

```
be/models/forecastsnapshot.js       (tùy chọn — lưu lại dự báo đã tạo để đối chiếu độ chính xác sau)
be/services/forecast/timeseries.js  (gom dữ liệu theo khung thời gian)
be/services/forecast/demand.js      (thuật toán dự báo)
be/services/forecast/explain.js     (sinh object explanation)
be/controllers/forecastController.js
be/components/forecast.js           (router — gắn vào index.js)
ad/src/components/forecast.jsx      (UI + biểu đồ giải thích)
be/tests/forecast.test.js
```

Ước lượng: **3–4 ngày** cho Codex nếu spec rõ. Đây là việc phải khởi động ngay.

---

## 4. Lộ trình 14 ngày

### Tuần 1 — 06/09 → 13/09 · *Bù tính năng*

| Ngày | Sản phẩm | Quyển |
|------|----------|-------|
| CN 06/09 | Nộp tiến độ tuần. Chốt spec module dự báo | — |
| 07–09/09 | **Codex viết module dự báo** (service + API + test) | Chuyển 1.3/1.4 sang Chương 2; bổ sung mục Yêu cầu + Dữ liệu vào Chương 1 |
| 10–11/09 | **UI dự báo + biểu đồ giải thích** trên `ad/` | Xóa 2.5.4; cắt phần công nghệ khỏi Chương 2 gộp vào 3.1; bỏ mục 2.1.4 |
| 12–13/09 | **Hoàn thiện chatbot**: nối `customerbehavior` vào luồng tư vấn, chốt xử lý `out_of_scope`/`nonsense` | Vẽ lại 3 biểu đồ Use Case có kế thừa |

**Chốt cuối tuần 1: tính năng đóng băng. Từ 14/09 chỉ sửa lỗi, không thêm mới.**

### Tuần 2 — 14/09 → 20/09 · *Hoàn thiện quyển*

| Ngày | Việc |
|------|------|
| 14–15/09 | Biểu đồ lớp tổng quát (cắt trang, chữ đọc được) + Deployment Diagram đúng UML |
| 15–16/09 | Bảng thiết kế CSDL vật lý cho 11 collection (chính trong thân bài, còn lại Phụ lục) |
| 16–17/09 | Viết `3.2.4` chatbot + `3.2.5` dự báo, kèm đặc tả Use Case và biểu đồ trình tự tương ứng ở Chương 2 |
| 17–18/09 | Mở rộng Chương 3: chèn 12 ảnh giao diện + mô tả từng ảnh |
| 18–19/09 | **Kiểm thử thật**: chạy `be` (cần Mongo local), `fe`, `ad`. Ghi lại lỗi phát hiện được, chi tiết |
| 19/09 | Phụ lục: đặc tả Use Case còn lại, bảng CSDL còn lại, sơ đồ phụ |
| 20/09 | **Rà soát định dạng + nộp** |

### Tuần 3 — 21/09 → 27/09 · *Dự phòng*

Slide bảo vệ, tập trình bày, sửa theo góp ý cuối của thầy. **Không lập kế hoạch viết code ở tuần này.**

---

## 5. Checklist định dạng trước khi nộp

Theo `2025-phu-luc-quy-dinh-lam-da-kltn_SV.doc`:

- [ ] Times New Roman 14, dãn dòng 1.5 lines, không nén/giãn ký tự
- [ ] Lề: trên 2.5 · dưới 2.0 · **trái 3.5** · phải 2.0 (cm)
- [ ] Số trang **ở giữa, phía trên** đầu trang
- [ ] Đánh số mục tối đa 4 cấp; **mỗi nhóm tiểu mục phải có ít nhất 2 tiểu mục** (không có 2.1.1 mà thiếu 2.1.2)
- [ ] Hình/bảng đánh số gắn với chương (Hình 3.4 = hình thứ 4 chương 3)
- [ ] **Tên bảng đặt TRÊN bảng, tên hình đặt DƯỚI hình**
- [ ] Trong văn bản viết "xem Hình 3.2", không viết "hình dưới đây"
- [ ] Danh mục hình / bảng / từ viết tắt đầy đủ (hiện `DANH MỤC BẢNG BIỂU` mới liệt kê 3 bảng nhưng thân bài có 24 — **phải cập nhật**)
- [ ] Tài liệu tham khảo: xếp riêng theo ngôn ngữ, người Việt xếp ABC **theo tên** (không đảo họ lên trước), dòng thứ hai lùi vào 1 cm
- [ ] Chỉ liệt kê tài liệu **thực sự được trích dẫn** trong bài
- [ ] Bìa cứng in chữ nhũ, đủ dấu tiếng Việt, khổ 210×297
- [ ] **Tên GVHD, ngành, mã sinh viên khớp hệ thống** (thầy đã cảnh báo lỗi này)
- [ ] Phụ lục không dày hơn phần chính

---

## 6. Rủi ro

| Rủi ro | Mức | Xử lý |
|--------|-----|-------|
| Module dự báo không kịp | **Cao** | Bắt đầu ngay 07/09. Nếu tới 13/09 chưa xong: cắt xuống chỉ còn đầu ra #1 + #2 (dự báo nhu cầu + gợi ý số lượng nhập), bỏ #3 #4. Thà một tính năng có giải thích tử tế còn hơn bốn tính năng dở |
| Quyển phình quá 80 trang | Trung bình | Đẩy xuống Phụ lục — thầy đã nói rõ Phụ lục không bị tính |
| Biểu đồ lớp tổng quát không đọc được | Trung bình | Cắt trang theo cách thầy chỉ, nối bằng đường chấm. **Không bao giờ thu nhỏ chữ để nhét vừa một trang** |
| `be` test cần Mongo local | Thấp | Bật `mongod` trước khi chạy `npm test` trong `be/` |
| Nhiều AI agent sửa chồng nhau | Trung bình | Đọc `git status` / `git diff` trước mỗi phiên (theo `AGENTS.md` §8) |
| Bản thân tôi (Claude) đang không chạy được shell trên máy bạn | — | Workspace Linux của desktop app lỗi, phải stage từng file. Thử khởi động lại app; nếu không được thì vẫn làm việc bình thường, chỉ chậm hơn |

---

## 7. Ba việc làm ngay hôm nay

1. **Nộp tiến độ tuần** lên hệ thống (sáng Chủ nhật — thầy yêu cầu đều đặn).
2. **Chốt spec module dự báo** để Codex bắt tay vào sáng mai.
3. **Tra rubric chấm** trong đề cương học phần trên hệ thống — thầy nhắc: *"trong cái đánh giá ấy
   nó có mấy cái chuẩn rubric... trong đấy có những cái triển khai cái sản phẩm đấy."*
   Biết trước barem thì biết nên dồn sức vào đâu.
