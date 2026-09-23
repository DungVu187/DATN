# Quét hoá đơn AI — chẩn đoán, thêm model mới và chi phí

Ngày chạy: **07/09/2026**. Ảnh mẫu: `C:\Users\dungv\Downloads\Ảnh hóa đơn` (6 phiếu xuất kho **in**, 7–21 dòng).
File sửa: `be/services/productInvoiceGemini.js`, `be/tests/product_invoice_gemini.test.js`, `be/tests/product_invoice_scan_http.test.js`.

---

## 1. Vì sao trước đây phải tụt xuống 3.1-flash-lite

Tái lập đúng qua service thật, ảnh `01.jpg`:

```
gemini-3.5-flash      → Timeout 25s      (thực tế cần 32s)
gemini-2.5-flash      → HTTP 429 (0.55s) hết quota NGÀY
gemini-3.1-flash-lite → OK 6.97s ✓
Tổng: khách chờ 32.5 giây
```

**Hai nguyên nhân khác nhau:**

1. `gemini-3.5-flash` quét *đúng* nhưng quá chậm nên bị trần 25s cắt. Đo trên 6 ảnh với timeout rộng: **4/6 ảnh vượt 25s** (14.8s → 38.4s). Thời gian phụ thuộc **số dòng hoá đơn**, không phải dung lượng ảnh.
2. `gemini-2.5-flash` hết hạn mức miễn phí: `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20` → **20 request/ngày**.

Giả thuyết ban đầu của tôi (`parseInvoiceGeminiData` chỉ đọc `parts[0].text`) đã kiểm và **không phải nguyên nhân** — mọi model đều trả đúng 1 part.

---

## 2. Đã sửa gì

| Hạng mục | Trước | Sau |
|---|---|---|
| Danh sách model | 3.5-flash → 2.5-flash → 3.1-flash-lite → 2.5-flash-lite → 3-flash-preview | **3.8 → 3.7 → 3.6 → 3.5-flash → 3.5-flash-lite → 3.1-flash-lite → 2.5-flash-lite** |
| Timeout mỗi model | 25s | **45s** |
| Trần cả chuỗi | không có | **90s** |
| Giới hạn thinking | không gửi | **3.x: `thinkingLevel: LOW`, 2.5.x: `thinkingBudget: 0`** |
| JSON hỏng | **lần quét thất bại luôn** | **tự chuyển model kế tiếp** |
| Đổi thứ tự model | phải sửa code | **`INVOICE_GEMINI_MODELS` trong `.env`** |

**Tham số thinking phải theo họ model** — đo thật:

| Model | `thinkingLevel: LOW` | `thinkingBudget: 0` |
|---|---|---|
| 3.8 / 3.7 / 3.6 / 3.5-flash, 3.5 / 3.1-flash-lite | ✅ | ❌ 400 với 3.6-flash và 3.5-flash-lite |
| 2.5-flash-lite | ❌ 400 "Thinking level is not supported" | ✅ |

**Lỗi JSON hỏng** là lỗ hổng thật do test thực tế lộ ra: `3.8-flash` có lần trả HTTP 200 nhưng JSON bị cắt giữa dòng, mà parse lại nằm **ngoài** vòng lặp model nên không fallback → lần quét chết hẳn. Đã gom parse vào trong vòng lặp (`runInvoiceGeminiLadder`).

---

## 3. Test

- Unit/HTTP: **5 suite / 95 test đạt** (`product_invoice_gemini`, `product_invoice_scan_http`, `product_invoice_matching`, `invoice_scan_file_lifecycle`, `model_boundaries`). Thêm 4 test mới: JSON hỏng → fallback, phản hồi rỗng → fallback, env override, hết ngân sách thời gian.
- **Độ chính xác** — chấm với đáp án đọc bằng mắt từ ảnh `111.jpg` (21 dòng, đối chiếu STT / mã hàng / SL / đơn giá / tiền thuế):

| Model | Thời gian | Dòng | Mã | SL | Đơn giá | Tiền thuế |
|---|---:|---:|---:|---:|---:|---:|
| gemini-3.7-flash | 8.6s | 21/21 | 21/21 | 21/21 | 21/21 | 21/21 |
| gemini-3.6-flash | 40.0s | 21/21 | 21/21 | 21/21 | 21/21 | 21/21 |
| gemini-3.5-flash-lite | 6.0s | 21/21 | 21/21 | 21/21 | 21/21 | 21/21 |
| gemini-3.1-flash-lite | 6.8s | 21/21 | 21/21 | 21/21 | 21/21 | 21/21 |

**Mọi model đều 100% chính xác trên hoá đơn in** — model mạnh không cho dữ liệu tốt hơn, chỉ chậm hơn.

- **Quét thật 6/6 ảnh, A/B hai thứ tự:**

| Thứ tự | Thành công | Thời gian | Model trả kết quả | Số ảnh phải fallback |
|---|---|---|---|---|
| Mạnh trước (đang dùng) | 5/6 | 8.2s – 71.4s, 1 ảnh **thất bại** | 3.8×1, 3.7×1, 3.6×2, 3.5-flash×1 | 4/5 |
| Lite trước (qua env) | **6/6** | **3.0s – 6.4s** | 3.5-flash-lite × 6 | **0/6** |

Ảnh thất bại (`2.jpg`): 503 → 429 → 2 lần timeout đã ăn hết ngân sách 90s, **chưa kịp tới model Lite** vốn chỉ cần 6s.

---

## 4. Token thật và chi phí

Token trung bình mỗi ảnh (đo trên 6 hoá đơn):

| Họ model | Vào (input) | Trong đó prompt / ảnh | Ra (output) |
|---|---:|---|---:|
| Gemini 3.x | **5.127** | 4.054 / ~1.070 | **1.660** |
| Gemini 2.5 | **4.312** | 4.054 / 258 | **1.634** |

> **79% token vào là do system prompt** (11.726 ký tự = 4.054 token), không phải ảnh. Đây là chỗ giảm chi phí hiệu quả nhất nếu cần.

Giá theo [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) đọc ngày 07/09/2026; tỷ giá **1 USD = 26.250 VND** (giá bán NHTM 07/09/2026).

| Model | Giá in/out (USD/1M) | 1 ảnh | 50 ảnh | 100 ảnh | 200 ảnh | 500 ảnh |
|---|---|---:|---:|---:|---:|---:|
| gemini-3.8-flash | 0,75 / 3,75 | 264đ | 13.217đ | 26.434đ | 52.869đ | 132.172đ |
| gemini-3.7-flash | 0,75 / 3,75 | 264đ | 13.217đ | 26.434đ | 52.869đ | 132.172đ |
| gemini-3.6-flash | 0,75 / 3,75 | 264đ | 13.217đ | 26.434đ | 52.869đ | 132.172đ |
| ⤳ ba model trên **từ 01/01/2027** | 1,50 / 7,50 | 529đ | 26.434đ | 52.869đ | 105.738đ | 264.344đ |
| gemini-3.5-flash | 1,50 / 9,00 | **594đ** | 29.703đ | 59.405đ | 118.810đ | **297.025đ** |
| gemini-3.5-flash-lite | 0,30 / 2,50 | 149đ | 7.466đ | 14.931đ | 29.863đ | 74.656đ |
| gemini-3.1-flash-lite | 0,25 / 1,50 | 105đ | 5.237đ | 10.473đ | 20.946đ | 52.365đ |
| gemini-2.5-flash | 0,30 / 2,50 | 141đ | 7.059đ | 14.119đ | 28.238đ | 70.594đ |
| gemini-2.5-flash-lite | 0,10 / 0,40 | **28đ** | 1.424đ | 2.848đ | 5.695đ | **14.238đ** |

**Chênh lệch tới 21 lần** giữa `3.5-flash` (594đ/ảnh) và `2.5-flash-lite` (28đ/ảnh) — trong khi độ chính xác trên hoá đơn in là như nhau.

### Hạn mức miễn phí — quan trọng nhất

| Model | Miễn phí/ngày |
|---|---|
| 3.8 / 3.7 / 3.6 / 3.5-flash, 2.5-flash, 2.5-flash-lite | 20 ảnh |
| **3.5-flash-lite, 3.1-flash-lite** | **500 ảnh** |

Với đồ án, **mọi mốc 50–500 ảnh/ngày đều 0đ** nếu dùng `3.5-flash-lite` hoặc `3.1-flash-lite`.
Còn nếu để nhóm Flash lên đầu thì cạn 20 request/ngày rất nhanh — hôm nay tôi cạn quota 3.8 và 3.7 chỉ vì chạy test.

**Lưu ý về chi phí ẩn:** 503/429 không tính tiền (không sinh token), nhưng **request bị timeout phía client vẫn có thể bị tính** vì server đã xử lý xong. Thứ tự mạnh-trước hiện tại tạo nhiều timeout → có thể trả tiền cho những lần không dùng được.

---

## 5. Đề xuất

Dữ liệu nghiêng rõ về việc **đưa Lite lên đầu**: nhanh gấp 5–10 lần, 6/6 thành công, chính xác y hệt, và miễn phí tới 500 ảnh/ngày. Đổi không cần sửa code — thêm vào `be/.env`:

```bash
INVOICE_GEMINI_MODELS=gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-2.5-flash-lite
```

Còn tồn (chưa làm, chờ quyết định):
- Rút gọn system prompt (đang chiếm 79% token vào) hoặc dùng context caching.
- `responseMimeType: 'application/json'` để bỏ hẳn việc phải strip ```json.
- `parseInvoiceGeminiData` join mọi part thay vì `parts[0]` (phòng thủ).

## 6. Vòng đo thứ hai — 23 hoá đơn thật, API key mới

Bộ ảnh: `C:\Users\dungv\Downloads\anhhoadon\anhhoadon` — 23 ảnh, 1–25 dòng, gồm **hoá đơn viết tay**
(`xau1`, `xau2`, `xau4`), phiếu in nhàu/bẩn có ghi chú tay (`xau`), và phiếu in **lệch hàng** (`xau3`).
API key mới nên hạn mức của mọi model đều còn nguyên khi bắt đầu.

### 6.1 A/B hai thứ tự trên cùng 23 ảnh

| | Mạnh trước (đang cấu hình) | Lite trước (qua env) |
|---|---|---|
| Thành công | **21/23** | **23/23** |
| Trung vị | 24,2s | **4,4s** |
| p90 | 64,5s | **7,0s** |
| Chậm nhất | 85,1s | **7,3s** |
| Phải fallback | **15/21** | **0/23** |
| Model trả kết quả | 3.7×7, 3.8×6, 3.5-flash×5, 3.6×3 | 3.5-flash-lite × 23 |

Hai ảnh thất bại ở thứ tự mạnh-trước (`2.jpg`, `30f225aa…`): 503 → 503 → timeout → timeout đã ăn hết
ngân sách 90s, **chưa kịp gọi tới model Lite** vốn xử lý xong trong 6–7s.

**Kết quả đọc gần như trùng khớp:** 20/23 ảnh cho **cùng số dòng**. Chỉ khác ở 3 ảnh —
2 ảnh mạnh-trước thất bại, và 1 ảnh (`xau4.jpg`) Lite thêm 12 dòng rỗng (xem 6.3).

### 6.2 Độ chính xác trên 5 hoá đơn KHÓ

Đáp án: số dòng + tổng tiền in trên phiếu, do tôi mở từng ảnh đọc trực tiếp.

| Model | Đúng số dòng | Lỗi gọi API | Ghi chú |
|---|---|---|---|
| gemini-3.6-flash | **5/5** | 0 | chậm (7,4–30,5s) |
| gemini-3.5-flash | **5/5** | 0 | chậm (6,8–24,5s) |
| gemini-3.5-flash-lite | **5/5** | 0 | nhanh nhất (2,9–4,9s) |
| gemini-3.1-flash-lite | **5/5** | 0 | 1 lần tự bịa đơn giá (xem dưới) |
| gemini-2.5-flash-lite | 3/5 | 1 | `xau3` ra 7 dòng thay vì 6; `xau` parse lỗi |
| gemini-3.7-flash | 1/5 | 4 | 503/429 |
| gemini-3.8-flash | 0/5 | **5** | 429 — đã cạn 20 RPD do chính lần chạy ladder trước |

Chi tiết đáng chú ý:

- **`xau1.jpg` (viết tay hoàn toàn):** 5/5 model chạy được đều đúng **6 dòng, tổng đúng 267.000**, và đọc đúng
  số lượng thập phân **2,2 kg** (không nhầm thành 22). Kể cả `2.5-flash-lite`.
- **`xau3.jpg` (tên hàng lệch hàng so với cột số):** 3.6-flash, 3.5-flash, 3.5-flash-lite, 3.1-flash-lite đều
  đúng 6 dòng và **tổng đúng 623.000**. `2.5-flash-lite` sai (7 dòng, +65.000).
- **`xau2.jpg`:** mọi model cho tổng 1.445.000 thay vì 1.455.000 in trên phiếu. Đây **không phải lỗi model** —
  dòng 5 không có đơn giá nên model để `price = null` đúng theo prompt, phần 10.000 không vào phép nhân.
  Riêng `3.1-flash-lite` ra 1.455.500, tức nó **tự bịa một đơn giá** — sai nặng hơn.
- **`xau.jpg`:** cả 4 model đều ra 16 dòng ✓, và 3 model độc lập cùng cho tổng **45.381.100**, khác con số
  45.299.900 tôi đọc bằng mắt → khả năng cao **tôi đọc sai**, không phải model sai. `3.5-flash` lệch riêng
  (46.333.000) nên nó là bản đọc sai ở đây.

### 6.3 Lỗi thật của model Lite: bịa dòng rỗng

`xau4.jpg` là phiếu bàn giao viết tay chỉ có 3 dòng, bảng còn 12 dòng trống in sẵn số 4–15.

- `gemini-3.8-flash` → đúng **3 dòng**
- `gemini-3.5-flash-lite` → **15 dòng**: 3 dòng thật + 12 dòng `rawScannedName = ""`, `quantity = 0`, `price = null`

Nhưng **không cố định**: trong lần chấm điểm mục 6.2, chính `3.5-flash-lite` lại ra đúng 3 dòng.
Đây là lỗi **không tất định**, xuất hiện ngẫu nhiên. Lọc bỏ dòng có tên rỗng + SL 0 + giá null là xử lý được.

Tên hàng cũng lệch nhẹ: strong đọc "Trục Răng HGT V7", lite đọc "Thục Răng HGTVT" — strong sát hơn.

### 6.4 Token và chi phí — đo lại trên 23 ảnh

| Họ model | Vào | Trong đó prompt / ảnh | Ra (trung bình) | Ra (dải) |
|---|---:|---|---:|---|
| Gemini 3.x | **5.123** | 4.054 / ~1.070 | **1.446** | 116 – 2.783 |
| Gemini 2.5 | **4.312** | 4.054 / 258 | ~1.430 | — |

| Model | 1 ảnh | 50 ảnh | 100 ảnh | 200 ảnh | 500 ảnh |
|---|---:|---:|---:|---:|---:|
| 3.8 / 3.7 / 3.6-flash (KM tới 31/12/2026) | 243đ | 12.160đ | 24.320đ | 48.640đ | 121.600đ |
| ⤳ ba model trên từ 01/01/2027 | 486đ | 24.320đ | 48.640đ | 97.280đ | 243.200đ |
| 3.5-flash | 543đ | 27.167đ | 54.334đ | 108.667đ | 271.668đ |
| 3.5-flash-lite | 135đ | 6.762đ | 13.524đ | 27.047đ | 67.619đ |
| 3.1-flash-lite | 96đ | 4.792đ | 9.585đ | 19.169đ | 47.923đ |
| 2.5-flash | 128đ | 6.390đ | 12.780đ | 25.560đ | 63.900đ |
| 2.5-flash-lite | 26đ | 1.317đ | 2.633đ | 5.267đ | 13.167đ |

Trong hạn mức miễn phí (500 ảnh/ngày với `3.5-flash-lite` / `3.1-flash-lite`) thì **trả 0đ**.

### 6.5 Chi phí ẩn của thứ tự mạnh-trước

Một lần quét 23 ảnh theo thứ tự mạnh-trước đã **dùng hết toàn bộ 20 RPD/ngày của `gemini-3.8-flash`**,
vì nó được gọi đầu tiên cho mọi ảnh — kể cả 20 lần trả 503. Sau lần đó, mọi request tới 3.8-flash đều 429.
Ngoài ra timeout phía client vẫn có thể bị tính tiền dù không dùng được kết quả.

---

## 7. Giới hạn của kết luận

- **Vòng 1 (6 ảnh) chỉ có phiếu in.** Vòng 2 đã bổ sung hoá đơn viết tay nên kết luận đã vững hơn nhiều,
  nhưng vẫn chỉ là **5 ảnh khó** được chấm chi tiết, không phải toàn bộ 23 ảnh.
- Đáp án do **tôi đọc bằng mắt**, không phải dữ liệu gốc từ hệ thống. Với `xau.jpg` chính tôi đọc sai tổng
  (3 model độc lập cùng cho con số khác) — nên các ô "✗ lệch" phải đọc kèm phần diễn giải ở 6.2, không lấy máy móc.
- Thước đo "tổng(SL × đơn giá) khớp tổng in trên phiếu" **phạt oan hành vi đúng**: dòng không có đơn giá thì
  model để `null` là đúng, nhưng phép cộng sẽ lệch (trường hợp `xau2.jpg`).
- `gemini-3.8-flash` trả 503 "high demand" rất thường xuyên trong hai ngày đo; số liệu độ trễ và tỷ lệ lỗi
  của nó có thể khác khi hệ thống Google bớt tải.
- Lỗi bịa dòng rỗng của `3.5-flash-lite` là **không tất định** (2 lần chạy cho 2 kết quả khác nhau trên cùng ảnh),
  nên tần suất thật chưa đo được; cần chạy lặp nhiều lần mới kết luận được tỷ lệ.
