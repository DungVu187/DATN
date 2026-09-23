# REVIEW-CHATBOT-01 — Rà soát phần Codex đã làm theo SPEC-CHATBOT-01

**Người review:** Claude · **Ngày:** 06/09/2026 · **Phạm vi:** toàn bộ thay đổi liên quan chatbot

> Cách kiểm chứng: đọc code + **chạy thật** `classifyChatIntent` và `analyzeSentiment` bằng Node trên
> bộ câu thử. Mọi lỗi bên dưới đều có đầu ra thực tế kèm theo, không phải suy đoán.
>
> **Chưa chạy được `npm test`** (cần MongoDB local, và shell trên máy đang lỗi), nên phần "test có
> xanh không" chưa xác minh được.

---

## 0. Đính chính: TASK 2 trong spec là SAI — lỗi của người viết spec

**Task 2 không cần làm. Nó đã xong từ trước khi spec ra đời.** Cả 5 loại sự kiện hành vi đều đã
được gửi, từ 03/09:

| Sự kiện | Nơi gửi | Đã có từ |
|---|---|---|
| `view_product` | `fe/src/components/customerroutehistory.jsx:13` | trước |
| `click_product` | `fe/src/components/item.jsx:34` | trước |
| `add_to_cart` | **`fe/src/context/shopcontext.jsx:81`** | 03/09 |
| `search_product` | **`fe/src/pages/product.jsx:157`** và **`fe/src/layout/navbar/navbar.jsx:56`** | 03/09 |
| `start_checkout` | **`fe/src/pages/cart.jsx:184`** | 03/09 |

**Vì sao spec kết luận sai:** người viết spec chỉ tải về 6 file frontend rồi chạy `grep -rn` trong
đúng thư mục đó, nhưng lại diễn giải kết quả như thể đã quét toàn repo. `shopcontext.jsx`,
`cart.jsx`, `product.jsx`, `navbar.jsx` chưa từng được tải về nên không thể xuất hiện trong kết quả.

**Bài học ghi lại để không lặp:** không bao giờ kết luận "không nơi nào gọi X" từ một lần `grep`
trên bản sao cục bộ chỉ có vài file. Phải quét toàn repo, hoặc nói rõ là chưa kiểm tra hết.

Hệ quả: **xóa Task 2 khỏi spec.** Yêu cầu debounce 800ms cũng không cần — `navbar.jsx` bắn khi
submit form, `product.jsx` bắn khi áp bộ lọc, cả hai đều đã là sự kiện rời rạc.

---

## 1. Phần đã làm đúng (đã kiểm chứng bằng chạy thật)

**Task 1 đạt mục tiêu chính.** Chạy `classifyChatIntent` trên đúng 12 câu gợi ý trong
`QUICK_QUESTION_GROUPS`:

```
product_search       | Tìm PLC Siemens
price_query          | Giá của sản phẩm này bao nhiêu?
stock_query          | Sản phẩm này còn hàng không?
similar_product      | Có sản phẩm tương tự không?
specification_query  | Cho tôi thông số kỹ thuật
shipping_query       | Chính sách giao hàng thế nào?
warranty_query       | Chính sách bảo hành thế nào?
policy_query         | Chính sách mua hàng ra sao?        ← đã sửa
policy_query         | Chính sách bảo mật thông tin?      ← đã sửa
order_status_query   | Kiểm tra đơn hàng của tôi
product_search       | Tôi cần tư vấn chọn sản phẩm
human_handoff        | Tôi muốn liên hệ nhân viên         ← đã sửa
```

**12/12 hợp lý, không câu nào rơi vào `out_of_scope`.** Đây là điều kiện nghiệm thu quan trọng nhất
của Task 1 và nó đã đạt.

Ngoài ra, đã kiểm chứng đúng:

- `"sản phẩm này đánh giá thế nào"` → `product_search` (trước đây bị nhận nhầm thành `price_query`)
- `geminiChat.js` đã nội suy `CHAT_INTENTS.length` thay cho chuỗi cứng "11 intent"
- `sentiment` được truyền vào `buildChatSystemPrompt` và có dòng giọng điệu riêng theo từng nhãn
- `clearChat` **xóa thật** bằng `deleteMany` — chấm dứt tình trạng endpoint rỗng
- `chatmessage.js` có TTL, index `{chatSessionId, createdAt}` hợp lý
- Frontend: `chatSessionId` lưu `localStorage` **có bọc try/catch**, nạp lại lịch sử khi mở, nút xóa
  hội thoại, khối `needsHuman`, nhãn cảm xúc — đủ cả

**Một điểm Codex làm tốt hơn spec:** bộ lọc phân quyền lịch sử. Spec đề xuất dùng `distinct('userId')`
rồi so sánh; Codex dùng `{ chatSessionId, visitorId, userId: userId || { $exists: false } }`. Cách
này gọn hơn, chặt hơn (phải khớp cả `visitorId`), và không tốn thêm một truy vấn. Giữ nguyên.

---

## 2. Lỗi CHẶN — phải sửa trước khi demo

### B1. Chatbot chết khi MongoDB chết

`respondWithStoredChat` (controllers/chat.js:149) gọi `await ChatMessage.insertMany(...)` **trước**
`res.json` và **không bọc try/catch**. Mongo lỗi → văng lên catch ngoài cùng → trả **500**.

Đây không phải sơ suất: `be/tests/chat_history.test.js:96` có hẳn một test tên
`'returns an error instead of success when persistence fails'` khẳng định `response.status === 500`.

Điều này **trái trực tiếp** với spec §4.1 (*"Ghi không bao giờ được chặn trả lời"*) và điều kiện
nghiệm thu §4.10 (*"Tắt MongoDB rồi chat → vẫn nhận được câu trả lời"*).

Vì sao quan trọng hơn vẻ ngoài: hôm bảo vệ mà Mongo trục trặc một nhịp thì chatbot **im hẳn** thay
vì vẫn trả lời được. Đang biến một tính năng phụ (lưu lịch sử) thành điểm chết của tính năng chính.

**Sửa:** bọc `insertMany` trong `try/catch` chỉ `console.error`, rồi `res.json` bình thường. Đổi
test thành: mock `insertMany` reject → **vẫn 200 và vẫn có `reply`**.

### B2. "hiện tại còn hàng không" bị nhận là lời chào

Chạy thật:

```
greeting | hiện tại còn hàng không
greeting | hiện còn bao nhiêu cái
```

Nguyên nhân: `normalized.startsWith(phrase)` với `phrase = 'hi'`, không có ranh giới từ. `"hien tai
con hang khong"` bắt đầu bằng `"hi"`, và có đúng 5 từ nên lọt qua điều kiện `≤ 5 từ`.

`"hiện"` là một trong những từ mở đầu câu phổ biến nhất trong tiếng Việt thương mại. Đây là lỗi
**mới sinh ra** từ chính bản sửa Task 1 — trước đây so khớp bằng cả câu nên không dính.

**Sửa:** `normalized === phrase || normalized.startsWith(phrase + ' ')`.

### B3. Mã sản phẩm viết hoa bị chấm là khách đang bức xúc

Chạy thật:

```
frustrated 0.70 ["chu_hoa:100%"] | MITSUBISHI FX3U 32MT
frustrated 0.70 ["chu_hoa:100%"] | PLC SIEMENS S7-1200 CÓ SẴN KHÔNG
frustrated 0.70 ["chu_hoa:100%"] | ABB ACS580 01 12A5 4
```

Heuristic "≥60% chữ hoa ⇒ bức xúc" là hợp lý với shop thời trang, nhưng **đây là shop thiết bị điện
công nghiệp — mã hàng vốn dĩ viết hoa**. Khách gõ đúng mã sản phẩm thì bị gắn nhãn giận dữ, kéo theo
`needsHuman = true` và khối "Cần hỗ trợ trực tiếp?" bật lên giữa màn hình.

Đây là kịch bản demo gần như chắc chắn xảy ra: thầy gõ thử một mã PLC là thấy ngay.

**Sửa:** bỏ qua các token trông giống mã hàng trước khi tính tỉ lệ chữ hoa — token chứa cả chữ và
số, hoặc chứa `-`, hoặc nằm trong danh sách thương hiệu đã có sẵn ở `DOMAIN_WORDS`. Chỉ tính tỉ lệ
trên phần văn xuôi còn lại.

### B4. Regex đếm chữ hoa nhận nhầm chữ thường có dấu

`chatSentiment.js` dùng `/[A-ZÀ-Ỹ]/g` để đếm chữ hoa. Dải `À-Ỹ` (U+00C0–U+1EF8) **bao trùm cả chữ
thường có dấu** của tiếng Việt. Kiểm chứng:

```
á -> true    ộ -> true    ế -> true    ằ -> true    ữ -> true
```

Hậu quả thực tế:

```
"sản phẩm này còn hàng không ạ"   → 7/23 ký tự bị tính là HOA (ảẩàòàôạ), tỉ lệ 0.30
"Đơn đã đặt đã được duyệt chưa ạ" → tỉ lệ 0.58   ← sát ngưỡng 0.6
"Ổ cắm ở đó đã hết à"             → tỉ lệ 0.69   → frustrated
"Ở đó có ổ cắm đôi ạ"             → tỉ lệ 0.69   → frustrated
```

Câu hỏi lịch sự bình thường bị chấm là bức xúc. Và nền tỉ lệ của tiếng Việt thường đang nằm ở
0.48–0.58, tức là **áp sát ngưỡng 0.6** — chỉ cần câu nhiều dấu một chút là vượt.

**Sửa:** dùng thuộc tính Unicode: `/\p{Lu}/gu` cho chữ hoa và `/\p{L}/gu` cho tổng số chữ cái.

### B5. Không thể viết mục đánh giá cho Chương 3

Toàn bộ §4.8 chưa làm, và model hiện tại **không đỡ được** việc đó kể cả khi viết script sau:

| Thiếu | Hậu quả |
|---|---|
| Trường `fallback` trong `chatmessage` | không tính được tỉ lệ phải dùng trả lời cục bộ |
| Trường `latencyMs` | không có số liệu độ trễ Gemini (trung vị, p90) |
| Trường `needsHuman` | không thống kê được tỉ lệ phải chuyển người thật |
| `be/scripts/evalChatbot.js` | không có |
| `be/tests/fixtures/chat-eval-dataset.json` | không có |

Nhắc lại lý do Task 4 tồn tại: Chương 3 đã có mục `3.3.3 Đánh giá chức năng xử lý hóa đơn bằng AI`,
nên chatbot **bắt buộc** phải có mục tương đương. Không có số thì không viết được, mà không viết
được thì công sức làm chatbot không quy đổi ra điểm.

Ngoài ra `latencyMs` chưa đo ở đâu cả — spec §4.4 yêu cầu đo quanh đúng lời gọi
`generateChatResponse`.

---

## 3. Nên sửa

**S1. `policy_query` nuốt mất ý định mua hàng.** Chạy thật:

```
policy_query | tôi muốn đặt hàng sản phẩm này
policy_query | tôi muốn mua hàng này giá bao nhiêu
```

Khách muốn đặt hàng, hoặc đang hỏi giá, lại nhận về văn bản chính sách. Nguyên nhân: `mua hang` và
`dat hang` là **cụm hành động**, không phải cụm chính sách, nhưng đang nằm trong bộ từ khóa
`policy_query` vốn được kiểm tra trước `price_query`.

*Sửa:* chỉ nhận `policy_query` khi hai từ đó đi kèm `chinh sach` / `dieu khoan` / `quy dinh`, hoặc
chuyển hai từ đó xuống sau các nhánh `price_query` và `stock_query`.

**S2. Ngưỡng `needsHuman` là vô nghĩa.** Điều kiện `sentiment.level === 'frustrated' && score >= 0.6`
không lọc gì cả: nhánh `frustrated` luôn trả `0.6 + signals.length * 0.1`, mà đã vào được nhánh đó
thì `signals` có ít nhất 1 phần tử ⇒ score luôn ≥ 0.7. Hoặc nâng ngưỡng cho có tác dụng, hoặc bỏ hẳn
điều kiện score cho khỏi gây hiểu nhầm khi hội đồng đọc.

**S3. TTL lệch nhau.** `chatmessage` để 30 ngày, `customerbehavior` để 90 ngày. Chọn một con số và
giải thích được lý do — Chương 3 sẽ phải nêu chính sách lưu trữ, mà hai collection cùng loại dữ liệu
hành vi lại có hạn khác nhau thì khó biện minh.

**S4. Lịch sử trả cả `sentiment.signals` ra client.** `getChatHistory` dùng
`.select('role content intent sentiment createdAt')` nên `signals` lộ ra ngoài. Spec §4.5 nói giữ nội
bộ. Ngoài ra `.limit(100)` cứng trong code, không dùng tham số nào.

**S5. Sản phẩm thay thế bị lọc quá chặt.** `buildOutOfStockReply` chỉ lấy
`availability === 'available'`, bỏ qua `contact_for_price` — nhưng những sản phẩm đó **vẫn còn
hàng**, chỉ là cần gọi báo giá. Trong shop này nhóm đó không nhỏ, nên nhiều trường hợp câu trả lời
hết hàng sẽ không có lối ra nào, đúng thứ mà Task 3 sinh ra để tránh.

**S6. Nhãn `urgent` không có kịch bản hết hàng riêng**, rơi vào lời văn trung tính.

**S7. `be/models/chatmessage.js` có BOM (U+FEFF)** ở đầu file. Node bỏ qua được nhưng lệch với toàn
bộ repo, và dễ gây rối khi diff.

**S8. Văn phong code lệch quy ước repo.** `chatIntent.js` và `chatReplyTemplates.js` bị nén thành
các dòng đơn rất dài, và **comment tiếng Việt giải thích thứ tự ưu tiên trong `chatIntent.js` đã bị
xóa mất**. `AGENTS.md` yêu cầu comment tiếng Việt và bám pattern sẵn có.

Điểm này không chỉ là thẩm mỹ: `chatIntent.js` chính là file thuộc nhóm "20% cốt lõi" mà hội đồng sẽ
mở ra bắt giải thích. Một chuỗi 12 dòng `if` một dòng không chú thích sẽ khó trình bày hơn hẳn.

**S9. Frontend, hai chi tiết lộ ra người dùng:**
- Nhãn cảm xúc ghi `"Đã ghi nhận yêu cầu cảm xúc."` — câu này tối nghĩa, và giống hệt nhau cho cả 3
  nhãn. Nên đổi theo từng nhãn: "đã ghi nhận yêu cầu gấp" / "mình hiểu bạn đang lo lắng".
- Hotline trong khối `needsHuman` là `1900 0000` — số giả. Trong khi `item.jsx` đang dùng số thật
  `0901513825`. Hai chỗ phải khớp nhau.

**S10. `AMBIGUOUS_PHRASES` chỉ thay thế lần xuất hiện đầu tiên** vì `String.replace` với tham số
chuỗi. Câu có hai lần "đánh giá" sẽ sót lần thứ hai.

**S11. Test bắt buộc chưa viết.**
- `be/tests/chat_intent.test.js` **không được đụng tới** (vẫn 886 byte, mtime cũ). Lưới an toàn 12
  câu gợi ý theo spec §1.3 chưa có, cũng không có case nào cho `policy_query`, `human_handoff`, hay
  các biến thể chào.
- **Không có `chat_sentiment.test.js`.** Spec §3.5 yêu cầu mỗi nhãn ≥4 câu.

Đáng chú ý: **B2 và B3 sẽ bị bắt ngay nếu hai bộ test này tồn tại.** Đây chính là minh chứng cho
điều thầy nói về kiểm thử.

**S12. Không có `be/services/chatHistory.js`** như spec §4.3; logic nằm thẳng trong controller, khiến
`controllers/chat.js` phình từ 13KB lên 17KB. Chấp nhận được, nhưng nếu còn thời gian thì tách ra
cho đúng phân lớp mà `AGENTS.md` mô tả — Chương 2 đang trình bày kiến trúc phân lớp rõ ràng.

---

## 4. Thứ tự sửa đề nghị

| Ưu tiên | Việc | Ước lượng |
|---|---|---|
| 1 | **B2** ranh giới từ cho lời chào | 10 phút |
| 2 | **B4** đổi sang `\p{Lu}` / `\p{L}` | 10 phút |
| 3 | **B3** bỏ token mã hàng trước khi tính tỉ lệ chữ hoa | 30 phút |
| 4 | **B1** bọc try/catch quanh `insertMany`, sửa lại test | 30 phút |
| 5 | **S1** tách cụm hành động khỏi `policy_query` | 20 phút |
| 6 | **S11** viết `chat_intent.test.js` (12 câu) + `chat_sentiment.test.js` | 1 giờ |
| 7 | **B5** thêm `fallback`/`latencyMs`/`needsHuman` vào model, viết `evalChatbot.js` + fixture | 3 giờ |
| 8 | S2–S10 gom một lượt | 1 giờ |

B1–B4 và S1 gộp lại chưa tới hai giờ nhưng gỡ được toàn bộ rủi ro demo. Nên làm hết trước, rồi mới
sang B5.

**Sau khi sửa xong:** chạy lại `npm test` ở `be/` (cần bật `mongod` trước), rồi mở UI bấm thử đủ 12
nút gợi ý, gõ thử một mã sản phẩm viết hoa, và tắt MongoDB rồi chat một câu.
