# Báo cáo triển khai chatbot NOVA theo `KE-HOACH-CHATBOT-TU-VAN.md`

Ngày chạy: **07/09/2026**. Máy: Windows 11, Node 24.11.1, MongoDB local.
Trạng thái: đã triển khai đủ 6 pha; phần chưa đo được ghi rõ ở mục 6.

---

## 1. Baseline trước khi sửa (Pha 0)

- Nhóm test chatbot cũ: **5 suite / 34 test đạt** (`tests/chat_intent`, `chat_context`, `chat_http`, `chat_history`, `gemini_chat`).
- Snapshot catalog công khai DB `Ecom` (chỉ đọc): **270 sản phẩm `display:true`, 28 type, 26 brand, 5 section**
  → `tests/artifacts/chatbot/catalog-snapshot.json`.
- Tái lập lỗi mục 2.3 kế hoạch → `tests/artifacts/chatbot/baseline-probes.json`, script `scripts/chatbotBaseline.js`.

Kết quả tái lập (đúng như kế hoạch mô tả):

| Câu hỏi | Trước | Sau |
|---|---|---|
| Bán cảm biến tiệm cận không? | `out_of_scope`; retrieval ra *Cuộn hút / Biến áp cách ly* | `Cảm biến` → Cảm biến tiệm cận PR12-4DN, PRL18-8DN |
| rơ le trung gian | `out_of_scope`; ra *Bộ nguồn / Relay bảo vệ mất pha* | `Relay Trung Gian`, đúng tập với "relay trung gian" |
| Có nút nhấn không? | `out_of_scope`; retrieval rỗng | `Nút Nhấn`, đúng nhóm |
| Van điện từ Airtac | `out_of_scope`; lẫn *Xy lanh khí nén* | `Van điện từ` + hãng `Airtac` |
| Xy lanh / xi lanh khi nen | `out_of_scope` | `Xy lanh khí nén` (cả có dấu và không dấu) |
| Xin chào, tìm PLC Siemens | `greeting`, ra *Van khí nén DN300* | `product_search`, ra PLC Siemens |
| Còn bao nhiêu cái? | `price_query` | `stock_query` |
| Nguồn tin bóng đá hôm nay? | ra *cầu dao tự động, cảm biến xi lanh* | `out_of_scope`, 0 card |

`scripts/chatbotProbe.js` chạy lại đường mới trên `Ecom` (chỉ đọc) → `tests/artifacts/chatbot/after-probes.txt`.

---

## 2. File đã thay đổi

**Mới**

| File | Vai trò |
|---|---|
| `be/services/chatCatalog.js` | Catalog động từ `display:true`, alias theo cụm, cache TTL 5 phút + 1 promise chung, cờ `stale`, `resetCatalogCache()` |
| `be/services/chatRetrieval.js` | Chuẩn hóa, tra mã chính xác, ràng buộc type/brand/cụm, regex bỏ dấu, phân tầng liên quan 1–4, cờ `queried` |
| `be/services/chatConversation.js` | Đọc/giải quyết tham chiếu theo đúng scope lịch sử, gộp `pendingQuestion`, dựng memory |
| `be/tests/chat_regression.test.js` | 35 test hồi quy R01–R30 |
| `be/tests/fixtures/chatProducts.js` | 21 fixture productKey → ObjectId, seed/clean EcomTest |
| `be/scripts/chatbotBaseline.js`, `chatbotProbe.js`, `chatbotLiveTranscript.js` | Baseline, probe, transcript live |

**Sửa**

`be/services/chatIntent.js` (phân tích nội bộ task/fields/entities/reference/resolution, giữ intent công khai) ·
`be/services/chatContext.js` (hydrate mới mỗi lượt, sửa bug `candidate.variant` sau khi map, bỏ `recentBehavior` khỏi đường tư vấn) ·
`be/services/chatReplyTemplates.js` (renderer dữ kiện, so sánh, hỏi lại, evidence + render lựa chọn) ·
`be/services/geminiChat.js` (schema chọn bằng chứng thay vì viết reply) ·
`be/controllers/chat.js` (điều phối) · `be/models/chatmessage.js` (`memory`, `answerType`, `totalLatencyMs`) ·
`be/scripts/evalChatbot.js` (evaluator mới) · `be/tests/fixtures/chat-eval-dataset.json` ·
`be/tests/chat_http.test.js`, `be/tests/gemini_chat.test.js` ·
`fe/src/components/chatbox.jsx`, `fe/src/components/chatbox.test.jsx`.

**Không đụng tới:** cart API, `productListing`/`productSearch` dùng chung, quyền admin, validator `be/validators/chat.js`
(hợp đồng `/chat/send` giữ nguyên; response chỉ **thêm** `answerType`, `totalLatencyMs` tùy chọn).

---

## 3. Thay đổi cốt lõi

1. **Catalog động thay 20 keyword cứng.** Type/brand lấy từ `Product.distinct(..., {display:true})`, khớp cụm dài trước cụm ngắn nên `relay trung gian` không rơi về `relay`. Alias thủ công chỉ là kiến thức ngôn ngữ (rơ le/xi lanh/nút bấm/khởi động từ/át tô mát…). Cụm mơ hồ (`nguồn`, `đèn`, `TI`, `Delta`, `Khác`) chỉ tính khi câu có bằng chứng khác → "Nguồn tin bóng đá" bị chặn.
2. **Không bỏ token sau khi bỏ dấu.** Cụm danh mục/mã/thông số được nhận trước; phần còn lại chỉ bị cắt từ xã giao **ở rìa**. `cận`, `cân`, `van`, `khí`, `nén` không còn bị coi là từ đệm.
3. **Trả lời trực tiếp bằng dữ kiện DB.** Giá/tồn/bảo hành/thông số do renderer cục bộ dựng, không gọi model để lặp dữ liệu. Bỏ ràng buộc "2 câu / 280 ký tự" và luật "không ghi giá/số lượng".
4. **Gemini chỉ chọn bằng chứng.** Schema mới `{ answerType, productIds, factIds, reasonIds, questionKey, needsHuman }`; backend kiểm tra từng ID và quan hệ với sản phẩm rồi tự dựng câu tiếng Việt. Model không có đường ghi text tự do ra khách.
5. **Bộ nhớ hội thoại phía server.** `ChatMessage.memory` giữ `focusedProductIds` (≤2), `shownProductIds` (≤5, đúng thứ tự card), `selectedVariants`, `pendingQuestion`. Cùng scope `chatSessionId + visitorId + userId`. Không lưu giá/tồn làm nguồn sự thật.
6. **Sửa lỗi xếp hạng similar:** đọc `candidate.availability` sau khi map public (trước đây đọc `candidate.variant` đã bị đổi tên → tồn kho luôn 0 điểm). Ưu tiên đúng nhóm; cùng hãng chỉ là tín hiệu phụ.
7. **Card không thêm nhầm biến thể.** Biến thể đại diện giữ chỉ số gốc; nhiều biến thể → "Chọn phiên bản" mở chi tiết; bỏ nút "Liên hệ" disabled giả.
8. **Bỏ lời hứa không có backend:** không còn "báo ngay khi hàng về"; hết hàng nói rõ "chưa có lịch nhập hàng xác nhận".

---

## 4. Kết quả đo

### 4.1 Test

| Bộ | Lệnh | Kết quả |
|---|---|---|
| Nhóm chatbot BE | `node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath tests/chat_intent.test.js tests/chat_context.test.js tests/chat_http.test.js tests/chat_history.test.js tests/gemini_chat.test.js tests/chat_regression.test.js` | **6 suite / 74 test đạt** (baseline 5/34) |
| FE | `npm test` | **14 file / 93 test đạt** |
| FE build | `npm run build` | đạt (cảnh báo chunk >500kB có sẵn từ trước) |
| Toàn bộ BE | `npm test` | **81 suite đạt / 26 suite trượt (1204 đạt / 189 trượt)** — xem 4.4 |

### 4.2 Evaluator offline (`node scripts/evalChatbot.js`)

Dataset `2026-09-07.1`. Ca phủ danh mục **sinh động từ catalog thật** (không hardcode 28/26); ca khó gán nhãn tay.

| Chỉ số | Toàn bộ | dev | holdout |
|---|---|---|---|
| Routing (task + fields + resolution + entity) | **103/104 = 99.0%** | 82/82 = 100% | 21/22 = 95.5% |
| catalog_type | 28/28 = 100% | | |
| catalog_brand | 8/8 = 100% | | |
| code_alias | 18/18 = 100% | | |
| needs_multi | 19/20 = 95% | | |
| out_of_scope | 15/15 = 100% | | |
| safety_policy | 15/15 = 100% | | |
| Retrieval Hit@3 | **1.00** (63 ca) | | 1.00 (11 ca) |
| Precision@k | **1.00**, k trung bình 1.37 | | 1.00 |
| Trả nhóm bị cấm | 0 | | 0 |
| Multi-turn | **6/6** | 4/4 | 2/2 |

Ca trượt duy nhất (holdout, **không tinh chỉnh theo nó**):
`need-15 "Cần contactor cho tải 7.5kW thì chọn dòng nào?"` → phân loại `search` thay vì `advice`.
Hệ quả thực tế nhẹ: vẫn ra đúng nhóm Contactor, chỉ khác nhánh diễn đạt.

Báo cáo JSON: `eval-report-offline-all.json`, `eval-report-offline-holdout.json`.

### 4.3 Hồi quy R01–R30

35 test trong `tests/chat_regression.test.js` đạt hết, phủ: R01–R30 trừ phần UI của R23 (nằm ở `fe/src/components/chatbox.test.jsx`).
Gồm cả: hàng ẩn không lọt ra, không lộ `importPrice`/`quantityInStorage`/`earn`, prompt injection không đổi được giá,
visitor khác không dùng lại tham chiếu, đổi giá/tồn giữa lượt dùng dữ liệu mới, lỗi Mongo báo "chưa tra được dữ liệu".

### 4.4 Lỗi backend có sẵn, không do patch này

26 suite trượt đều là product/order/inventory và đều trả **403** thay vì 200/400.
Nguyên nhân nằm ở thay đổi **đã có sẵn trong working tree trước phiên này**: `be/middlewares/auth.js` đã xóa
`const ADMIN_FULL_ACCESS = true;` (comment trong chính diff ghi "B6 sẽ lật thành false khi hoàn tất đổi tên quyền + backfill quyền admin").
Không có suite chat nào trong danh sách trượt. Patch chatbot không đụng tới `middlewares/auth.js` hay quyền admin.

### 4.5 Gemini thật + browser

- Chạy backend tạm ở **cổng 5001** (không tắt tiến trình `node index.js` cổng 5000 của bạn), nối DB `Ecom`, dùng `GEMINI_API_KEY` thật.
- **39 lượt** (25 câu một lượt + 5 chuỗi) → `live-transcript.json`.
- Lượt có Gemini phản hồi: câu trả lời **đúng dữ kiện DB**, có lý do kiểm chứng được, không bịa thông số.
- Giữa chừng Gemini trả **HTTP 429 – hết quota free tier trong ngày**. Từ đó mọi lượt tư vấn chuyển sang nhánh cục bộ:
  vẫn ra đúng nhóm, đúng giá/tồn, `needsHuman=false`, `fallback=true`. Đây chính là ca fault-injection 429 của mục 11.3.
- Độ trễ đo phía client: lượt cục bộ **median ~10ms**; lượt có gọi Gemini **3.1–15.2 giây** (một lượt 15.2s vượt mốc đề xuất 15s).
- Browser thật (`http://localhost:3000`): card hiển thị tên, mã · hãng, giá, tồn, **dòng lý do mới**; hỏi tiếp
  "Cái thứ hai giá bao nhiêu?" trả đúng **Contactor S-T20 – 462.000 đ** khớp card thứ hai; nút "Xóa" xóa sạch lịch sử.
- Đã xóa 78 tin nhắn test khỏi `Ecom` sau khi đo.

---

## 4.6 Cấu hình model Gemini cho chatbot

Trước: cố định `gemini-2.5-flash`. Sau: chuỗi 5 model, mạnh trước – hạ dần khi bị chặn
([geminiChat.js](../../services/geminiChat.js)). Override bằng `GEMINI_CHAT_MODELS` (danh sách, phân tách bằng dấu phẩy)
hoặc `GEMINI_CHAT_MODEL` (ghim một model); trần thời gian cả chuỗi qua `GEMINI_CHAT_BUDGET_MS` (mặc định 30s).

Đo thật ngày 07/09/2026 (một request/model, cùng bộ evidence):

| # | Model | RPM/RPD tài khoản | Kết quả đo | Nhận xét |
|---|---|---|---|---|
| 1 | `gemini-3.8-flash` | 5 / 20 | **503 high demand** (2/3 lần lỗi), khi được thì 2.5s | Mạnh nhất nhưng đang quá tải |
| 2 | `gemini-3.7-flash` | 5 / 20 | OK 4.4s, chọn đủ fact + reason | Ổn định nhất trong nhóm Flash |
| 3 | `gemini-3.6-flash` | 5 / 20 | OK 3.9s, chọn 1 fact | |
| 4 | `gemini-3.5-flash` | 5 / 20 | OK **13.7s** | Chậm, để sau |
| 5 | `gemini-3.5-flash-lite` | **15 / 500** | OK **1.1s**, chọn đủ fact | Lưới an toàn khi 4 model trên hết quota |

Chuỗi mặc định chạy end-to-end: `3.8-flash` lỗi 503 → tự hạ xuống `3.7-flash`, tổng **5.2s**, lựa chọn hợp lệ.
Hạn mức ngày cộng lại ≈ **580 request** (trước chỉ 20 → hôm nay đã cháy quota giữa lúc đo).

Lỗi cấu hình (`MISSING_API_KEY`, `FETCH_UNAVAILABLE`) dừng ngay, không thử model nào.
Khi mọi model đều lỗi, log một dòng gồm mã lỗi từng model rồi trả lời bằng nhánh cục bộ.

**Hệ quả cần biết:** giữ `gemini-3.8-flash` ở đầu thì khoảng 2/3 request phải trả thêm ~1.8s cho lần 503
trước khi hạ xuống `3.7-flash`. Nếu ưu tiên tốc độ demo, đặt `GEMINI_CHAT_MODELS=gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash-lite`
trong `be/.env` là đủ, không cần sửa code.

---

## 5. An toàn dữ liệu

- Mọi thao tác ghi của test/evaluator chỉ chạy khi tên DB thực tế là `EcomTest` (evaluator kiểm tra `mongoose.connection.name`).
- Baseline/probe trên `Ecom` chạy `autoIndex=false`, `autoCreate=false`, chỉ `find`/`distinct`/`countDocuments`.
- Không sửa `.env`, không in key/URI. Evaluator mặc định **không gọi API trả phí** (bỏ key khỏi tiến trình, khôi phục sau khi chạy).
- Không chạy song song hai tiến trình Jest. Không tự commit/stage/đổi branch.

---

## 6. Phần CHƯA đo được / còn hạn chế

1. **Live Gemini chưa đủ mẫu nghiệm thu.** Mục 12 yêu cầu ≥30 scenario live; quota free tier hết giữa chừng nên chỉ có
   khoảng 20 lượt thực sự đi qua model. **Chưa đạt gate "Live Gemini ≥90% trên ≥30 scenario"** — cần chạy lại khi quota reset.
2. **Bộ một lượt 104 ca, chưa phải 160 ca như mục 11.1.** Ca phủ danh mục sinh theo catalog của **EcomTest** (11 type/8 brand fixture),
   không phải 28 type/26 brand của `Ecom`. Chạy `--db=Ecom` sẽ ra đủ mẫu số thật nhưng evaluator chặn ghi ngoài `EcomTest`.
3. **Multi-turn 6 kịch bản, chưa phải 20** như mục 11.2.
4. **Chưa test UI biến thể trên dữ liệu thật:** `Ecom` hiện không có sản phẩm nào nhiều hơn 1 biến thể, nên nhánh
   "Chọn phiên bản" chỉ được phủ bằng fixture + test FE, chưa thấy trên browser.
5. **Backend dev cổng 5000 của bạn đang chạy `node index.js` (không phải nodemon)** nên vẫn là code cũ.
   Cần khởi động lại (`cd be && npm start`) để storefront dùng bản mới.
6. **Độ trễ p90 khi có Gemini ~15s**, sát/vượt mốc demo đề xuất. Chưa tối ưu (cắt bớt evidence, giảm số ứng viên gửi model).
7. Câu hỏi ngoài ngành nhưng nghe như hàng hóa (ví dụ "giá máy hàn" – NOVA không bán) hiện trả `out_of_scope`
   thay vì "chưa tìm thấy". Chấp nhận được nhưng chưa phân biệt tinh.

---

## 7. Lệnh chạy lại

```powershell
Set-Location -LiteralPath 'D:\Đồ án tốt nghiệp\NovaEcomWeb\be'
node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath tests/chat_intent.test.js tests/chat_context.test.js tests/chat_http.test.js tests/chat_history.test.js tests/gemini_chat.test.js tests/chat_regression.test.js --testTimeout=30000
node .\scripts\evalChatbot.js
node .\scripts\evalChatbot.js --split=holdout
node .\scripts\chatbotProbe.js --db=Ecom
```

```powershell
Set-Location -LiteralPath 'D:\Đồ án tốt nghiệp\NovaEcomWeb\fe'
npm test -- --run src/components/chatbox.test.jsx src/api/chatApi.test.js
npm run build
```

Live Gemini (chỉ khi chấp nhận chi phí, backend đang chạy):

```powershell
Set-Location -LiteralPath 'D:\Đồ án tốt nghiệp\NovaEcomWeb\be'
node .\scripts\chatbotLiveTranscript.js --base=http://localhost:5000
```
