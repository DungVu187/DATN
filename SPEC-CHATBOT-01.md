# SPEC-CHATBOT-01 — Hoàn thiện chatbot NOVA

**Người viết:** Claude (phiên 06/09/2026) · **Người thực hiện:** Codex · **Trạng thái:** chờ làm

> Đọc `AGENTS.md` và `KE-HOACH-DATN-2709.md` trước. Nhắc lại quy ước bắt buộc:
> `be/` là **CommonJS** (`require`/`module.exports`), `fe/` là **ESM** (`import`).
> **Comment tiếng Việt, tên biến/hàm tiếng Anh.** Bắt chước pattern sẵn có, đừng áp style mới.

## Bối cảnh

Chatbot đã có phần xương sống tốt: grounding chặt (`filterGeminiProducts` chỉ cho qua `productId`
có trong context), hành vi khách hàng đã có model + endpoint, fallback khi Gemini lỗi, rate limit.
**Không đụng vào những phần đó.**

Spec này vá 3 nhóm khiếm khuyết, xếp theo thứ tự thực hiện. Task 1 và 2 độc lập nhau, Task 3 phụ
thuộc Task 1.

Hai ràng buộc xuyên suốt:

- **Mọi logic phân loại phải giải thích được bằng lời**, không được giấu trong lời gọi LLM. Hội đồng
  sẽ yêu cầu mở source và chỉ ra vì sao một câu được xếp vào nhãn đó.
- **Không bao giờ để chatbot nhắc tới sản phẩm không có trong CSDL.** Nguyên tắc này đã có, giữ.

---

## TASK 1 — Sửa phân loại ý định (`chatIntent.js`)

### 1.1 Ba câu hỏi gợi ý đang trả về "ngoài phạm vi"

`fe/src/components/chatbox.jsx` → `QUICK_QUESTION_GROUPS` gợi ý 12 câu. Ba câu sau rơi vào
`out_of_scope`, tức là khách bấm đúng nút hệ thống mời bấm rồi bị trả lời "mình không hỗ trợ":

| Câu trên nút | Hiện tại | Phải thành |
|---|---|---|
| "Chính sách mua hàng ra sao?" | `out_of_scope` | `policy_query` |
| "Chính sách bảo mật thông tin?" | `out_of_scope` | `policy_query` |
| "Tôi muốn liên hệ nhân viên" | `out_of_scope` | `human_handoff` |

**Điểm mấu chốt:** tầng dữ liệu đã sẵn sàng. `chatContext.js` có `POLICY_KEYWORDS` với đủ 4 khóa
`purchase / warranty / shipping / privacy`, và `getRelevantPolicies(message)` tự tra khóa từ chính
câu hỏi. Chỉ có `chatIntent.js` là không có đường dẫn tới đó. Không cần viết thêm truy vấn nào.

**Việc cần làm:**

1. Thêm 2 intent vào `CHAT_INTENTS`: `policy_query`, `human_handoff`. Tổng thành **13 intent**.
2. Thêm nhánh nhận diện trong `classifyChatIntent`, đặt **sau** `warranty_query` và `shipping_query`
   (hai cái đó cụ thể hơn, phải được ưu tiên):
   - `policy_query`: khớp `chinh sach`, `mua hang`, `dat hang`, `huy don`, `bao mat`,
     `thong tin ca nhan`, `du lieu ca nhan`, `dieu khoan`
   - `human_handoff`: khớp `nhan vien`, `gap nguoi`, `tu van vien`, `hotline`, `so dien thoai`,
     `lien he truc tiep`, `gap ai do`
3. `human_handoff` **không** thuộc `isGeminiRequired` — trả lời cục bộ, không tốn lượt gọi API.
4. Trong `be/controllers/chat.js`:
   - Gộp `policy_query` vào đúng nhánh đang xử lý `warranty_query`/`shipping_query`
     (nhánh gọi `buildPolicyReply`). Không viết hàm mới.
   - Thêm nhánh `human_handoff` → trả câu mời để lại liên hệ + `needsHuman: true`.
   - Thêm `LOCAL_REPLIES.human_handoff`.
5. `be/services/geminiChat.js` → `buildChatSystemPrompt` đang hardcode chuỗi
   `'intent phải thuộc đúng danh sách 11 intent được cung cấp.'`.
   Sửa thành nội suy `CHAT_INTENTS.length` để không lệch khi danh sách thay đổi.

### 1.2 So khớp từ khóa không có ranh giới từ

`containsAny` dùng `String.includes` trên cả câu, nên khớp cả bên trong từ khác. Hiện tại thứ tự
lệnh `if` che được vài trường hợp (shipping đứng trước price nên "giao hàng" thoát), nhưng đó là
may mắn chứ không phải thiết kế — thêm một từ khóa mới là vỡ.

**Việc cần làm:**

1. `normalizeMessage` đã trả về chuỗi chỉ gồm `a-z0-9` và dấu cách đơn. Thêm hàm so khớp theo
   ranh giới từ và dùng nó thay cho `includes`:

   ```js
   // So khớp theo ranh giới từ để "gia" không khớp nhầm bên trong một từ khác.
   const containsPhrase = (haystack, phrase) => ` ${haystack} `.includes(` ${phrase} `);
   const containsAny = (value, phrases) => phrases.some((phrase) => containsPhrase(value, phrase));
   ```

2. Ranh giới từ **không** giải quyết được cụm nhập nhằng: `"đánh giá"` → `"danh gia"` vẫn chứa từ
   `"gia"` đứng riêng, nên bị xếp thành `price_query`. Xử lý bằng cách thu gọn các cụm nhập nhằng
   **trước khi** so khớp:

   ```js
   // Các cụm chứa từ khóa nhưng mang nghĩa khác; thu gọn để không khớp nhầm.
   const AMBIGUOUS_PHRASES = [
       ['danh gia', 'productreview'],   // "đánh giá" ≠ hỏi giá
       ['gia han', 'renew'],
       ['danh gia san pham', 'productreview'],
   ];
   ```

   Áp dụng ngay sau `normalizeMessage`, trước mọi lệnh `if`.

3. Lời chào đang so khớp bằng `greetingPhrases.includes(normalized)` — **bằng đúng cả câu**. Nên
   "xin chào bạn" hay "chào shop" đều rơi xuống `out_of_scope`. Đổi sang: câu ≤ 5 từ **và** bắt đầu
   bằng một trong các cụm chào → `greeting`.

### 1.3 Kiểm thử bắt buộc

Tạo `be/tests/chatIntent.test.js` (nếu chưa có thì tạo mới, có thì bổ sung):

- **Một case cho mỗi câu trong cả 12 câu gợi ý** của `QUICK_QUESTION_GROUPS`, khẳng định intent
  mong đợi. Đây là lưới an toàn chống tái phát — copy nguyên văn 12 câu từ `chatbox.jsx`.
- Các case ranh giới từ: `"sản phẩm này đánh giá thế nào"` → **không** phải `price_query`;
  `"chính sách giao hàng"` → `shipping_query` (không bị `price_query` cướp).
- Các biến thể chào: `"chào"`, `"xin chào bạn"`, `"chào shop"` → `greeting`.
- `"tôi muốn gặp nhân viên tư vấn"` → `human_handoff`.

### 1.4 Điều kiện nghiệm thu

- [ ] Cả 12 câu hỏi gợi ý đều cho ra intent hợp lý, không câu nào ra `out_of_scope`
- [ ] `npm test` trong `be/` xanh (cần MongoDB local ở `EcomTest`)
- [ ] Bấm lần lượt 12 nút trên UI, không nút nào trả về câu "Mình chỉ hỗ trợ..."

---

## TASK 2 — Bù 3 loại sự kiện hành vi chưa được gửi

### 2.1 Vấn đề

`be/models/customerbehavior.js` khai báo 5 loại sự kiện, validator kiểm đủ 5, nhưng frontend chỉ
gửi 2:

| Sự kiện | Nơi gửi hiện tại | Trạng thái |
|---|---|---|
| `view_product` | `fe/src/components/customerroutehistory.jsx` | ✅ |
| `click_product` | `fe/src/components/item.jsx` → `handleClick` | ✅ |
| `add_to_cart` | — | ❌ không nơi nào gửi |
| `search_product` | — | ❌ không nơi nào gửi |
| `start_checkout` | — | ❌ không nơi nào gửi |

Hệ quả: `getRecentBehavior` trả về dữ liệu nghèo hơn thiết kế, và khi hội đồng hỏi "5 loại sự kiện
này lấy từ đâu" thì 3 loại không có câu trả lời. `search_product` đặc biệt quan trọng vì đúng ý
thầy yêu cầu ghi lại *"người ta tìm cái gì"*.

### 2.2 Việc cần làm

**`add_to_cart` — đặt đúng MỘT chỗ:** trong `fe/src/context/shopcontext.jsx`, bên trong hàm
`addToCart`, ngay sau khi thêm giỏ thành công. Đặt ở đây thì mọi lối vào (thẻ sản phẩm, trang chi
tiết, thẻ sản phẩm trong chatbox) đều được ghi nhận mà chỉ có một chỗ gọi. **Không** rải lời gọi
vào từng component.

Lưu ý: validator bắt buộc `productId` với `add_to_cart` — phải truyền đúng, không được để rỗng.

**`search_product`:** tại nơi ô tìm kiếm danh mục được submit (kiểm tra `fe/src/pages/product.jsx`
và thanh tìm kiếm trong `fe/src/layout/navbar/`). Yêu cầu:
- Debounce **800ms**, chỉ gửi khi người dùng đã dừng gõ — tránh spam 1 event mỗi ký tự.
- Bỏ qua chuỗi rỗng và chuỗi < 2 ký tự.
- Không gửi lại nếu truy vấn trùng với lần gửi ngay trước đó.
- Validator bắt buộc trường `query` với loại sự kiện này.

**`start_checkout`:** tại trang giỏ hàng, khi người dùng bấm nút đặt hàng / chuyển sang thanh toán —
gửi **trước** khi điều hướng. Sự kiện này không cần `productId`.

### 2.3 Kiểm thử bắt buộc

- `fe/src/context/shopcontext.test.jsx`: `addToCart` thành công → tracker được gọi đúng một lần với
  `eventType: 'add_to_cart'` và đúng `productId`. Tracker phải được mock.
- Test debounce của tìm kiếm: gõ liên tiếp 5 ký tự trong 800ms → chỉ 1 event được gửi.
- Test: `addToCart` thất bại (API lỗi) → **không** gửi event.

### 2.4 Điều kiện nghiệm thu

- [ ] Thao tác thủ công đủ 5 hành vi, kiểm tra collection `customerbehaviors` trong MongoDB có đủ
      5 loại document
- [ ] Không có event rác: gõ tìm kiếm 20 ký tự chỉ sinh 1–2 document, không phải 20

---

## TASK 3 — Lớp cảm xúc và kịch bản hết hàng

Đây là phần ăn điểm nghiên cứu. Thầy hướng dẫn nói rõ:

> *"Chatbot nếu bạn làm hẳn thông minh ra thì phải hiểu được sâu hơn nữa từ cảm xúc... người ta
> đang bức xúc, người ta đang rất lo lắng cũng hiểu được."*

> *"Ví dụ hàng không có, mình hết hàng, thì chatbot nó sẽ nói kiểu gì đấy để cho người ta yên tâm,
> thấy nhẹ nhàng hơn — **chứ không báo một câu 'hết hàng'**."*

Hiện tại cảm xúc chỉ tồn tại dưới dạng **một dòng** trong `buildChatSystemPrompt`
(*"Nếu khách bức xúc, hãy thể hiện sự thấu hiểu..."*). Không đo được, không vẽ được vào quyển,
không demo được.

### 3.1 File mới: `be/services/chatSentiment.js`

Chạy **song song** với `chatIntent.js`, cùng phong cách: thuần hàm, không gọi API, không phụ thuộc
DB. Lý do bắt buộc không dùng LLM: phải giải thích được từng nhãn khi hội đồng hỏi, và phải đo được
độ chính xác để viết vào Chương 3.

**API:**

```js
// Trả về nhãn cảm xúc kèm danh sách dấu hiệu đã khớp để có thể giải thích được.
function analyzeSentiment(rawMessage) // -> { level, score, signals }
```

- `level`: `'neutral' | 'worried' | 'frustrated' | 'urgent'`
- `score`: số thực 0..1, độ mạnh của nhãn
- `signals`: mảng chuỗi, **liệt kê chính xác dấu hiệu nào đã khớp** (ví dụ
  `['tu_khoa:mai chua', 'dau_cham_than:3']`). Đây là phần cho phép giải thích, không được bỏ.

**Quan trọng — nhận `rawMessage` chưa chuẩn hóa**, vì cần đếm dấu `!` và tỉ lệ chữ HOA. Bên trong
tự gọi `removeVietnameseTones` cho phần so khớp từ khóa.

**Bộ dấu hiệu đề xuất** (Codex tinh chỉnh thêm khi test):

| Nhãn | Từ khóa | Dấu hiệu văn bản |
|---|---|---|
| `frustrated` | `mai chua`, `lau qua`, `cham qua`, `that vong`, `buc minh`, `sao lai`, `lan thu`, `khieu nai`, `te qua`, `khong chap nhan` | ≥2 dấu `!`; ≥60% chữ cái viết HOA (câu >10 ký tự) |
| `worried` | `lo lang`, `khong biet co`, `lieu co`, `so la`, `co sao khong`, `co dam bao`, `co that khong` | — |
| `urgent` | `gap`, `can gap`, `khan`, `ngay hom nay`, `som nhat`, `trong hom nay` | — |
| `neutral` | mặc định khi không khớp gì | — |

**Thứ tự ưu tiên khi khớp nhiều nhãn:** `frustrated` > `urgent` > `worried` > `neutral`.
Bức xúc phải thắng, vì đó là trường hợp cần chuyển người thật.

### 3.2 Ghép vào luồng xử lý

Trong `be/controllers/chat.js`, hàm `sendChatMessage`:

1. Gọi `analyzeSentiment(payload.message)` **ngay sau** `classifyChatIntent`.
2. Truyền `sentiment` vào `generateChatResponse` → `buildChatSystemPrompt` thêm **một dòng giọng
   điệu tương ứng**, thay cho dòng chung chung hiện tại:
   - `frustrated`: thừa nhận sự bất tiện trước, trả lời thẳng vào vấn đề, không vòng vo, không
     hứa điều backend chưa cung cấp
   - `worried`: trấn an bằng dữ kiện cụ thể có trong CONTEXT (tồn kho, chính sách), không nói suông
   - `urgent`: đưa thông tin quyết định lên đầu câu, bỏ phần rào đón
   - `neutral`: giữ nguyên như hiện tại
3. Nâng cấp `needsHuman`:
   ```js
   const needsHuman = result.needsHuman
       || (sentiment.level === 'frustrated' && sentiment.score >= 0.6);
   ```
4. **Trả `sentiment` ra response JSON** (cả `level` và `signals`). Frontend cần để hiển thị, và
   Chương 3 cần để có số liệu đánh giá.

### 3.3 Kịch bản hết hàng

Đường đi qua Gemini **đã có** luật mềm tử tế trong prompt (*"Nếu sản phẩm hết hàng, không được
khuyên khách mua ngay; có thể nêu sản phẩm thay thế còn hàng nếu CONTEXT có"*) — **giữ nguyên**.

Vấn đề nằm ở **hai đường vòng qua nó**, cả hai đang trả về đúng câu cụt mà thầy cấm:

| Hàm | Khi nào chạy | Câu trả lời hiện tại |
|---|---|---|
| `buildLocalProductReply` | Gemini lỗi/timeout | `Sản phẩm ${name} hiện đã hết hàng.` |
| `buildCompactProductReply` | Gemini trả lời quá dài, bị nén | không đả động gì tới việc hết hàng |

**Việc cần làm:** tạo `be/services/chatReplyTemplates.js` chứa hàm dựng câu trả lời hết hàng, dùng
chung cho cả hai đường trên. Cấu trúc câu bắt buộc gồm 3 phần, theo đúng thứ tự:

1. **Thừa nhận + đồng cảm**, chọn theo `sentiment.level`
2. **Lối ra**: tối đa 2 sản phẩm thay thế còn hàng lấy từ `context.similarProducts`
3. **Cam kết**: mời để lại liên hệ để được báo khi có hàng

Nếu `similarProducts` rỗng thì bỏ phần 2, giữ phần 1 và 3. **Không bao giờ dừng lại ở phần 1.**

Ví dụ đầu ra mong muốn (`neutral`):

> Sản phẩm ABC hiện đang hết hàng, mình rất tiếc. Bên mình còn hai lựa chọn cùng nhóm đang sẵn kho
> để bạn tham khảo bên dưới. Nếu bạn cần đúng mã ABC, để lại số điện thoại mình sẽ báo ngay khi
> hàng về nhé.

Ví dụ (`frustrated`):

> Mình hiểu là bạn đã mất công tìm mã ABC mà lại đúng lúc hết hàng. Mình gửi bạn hai lựa chọn cùng
> nhóm đang sẵn kho ngay bên dưới, và mình có thể chuyển bạn sang nhân viên tư vấn để xử lý nhanh hơn.

**Ghi chú cho tương lai:** khi module dự báo (SPEC riêng, chưa viết) hoàn thành, phần 3 sẽ được thay
bằng **ngày về hàng dự kiến** lấy từ dự báo. Thiết kế hàm sao cho thêm được tham số
`expectedRestockDate` về sau mà không phải viết lại — để tham số optional ngay từ bây giờ.

### 3.4 Frontend

`fe/src/components/chatbox.jsx` hiện chỉ đọc `data.reply`, `data.products`, `data.fallback` —
**bỏ qua cả `needsHuman` lẫn `intent`**. Cần:

1. Khi `needsHuman === true`: hiện một khối hành động dưới bong bóng trả lời, gồm số hotline và
   nút mở form để lại liên hệ. Không được im lặng nuốt tín hiệu này.
2. Khi `sentiment.level !== 'neutral'`: hiện một nhãn nhỏ, kín đáo trong bong bóng trả lời
   (ví dụ "đã ghi nhận yêu cầu gấp"). Mục đích là **demo được cho hội đồng thấy hệ thống có nhận
   diện cảm xúc**, nên phải nhìn thấy — nhưng đừng làm khách khó chịu, giữ nhỏ và trung tính.

### 3.5 Kiểm thử bắt buộc

Tạo `be/tests/chatSentiment.test.js`:

- Mỗi nhãn ít nhất 4 câu mẫu, khẳng định đúng `level`
- Khẳng định `signals` **không rỗng** khi `level !== 'neutral'` — đây là điều kiện để giải thích được
- Ca ưu tiên: câu vừa bức xúc vừa gấp → phải ra `frustrated`
- Ca âm tính: câu trung tính bình thường → `neutral`, `score === 0`

Bổ sung vào test controller:

- Sản phẩm hết hàng + Gemini lỗi → câu trả lời **chứa** gợi ý thay thế hoặc lời mời để lại liên hệ,
  và **không** khớp biểu thức `/^Sản phẩm .* hiện đã hết hàng\.$/`
- `frustrated` với `score >= 0.6` → response có `needsHuman === true`

`fe/src/components/chatbox.test.jsx`: response có `needsHuman: true` → khối liên hệ nhân viên
được render.

### 3.6 Điều kiện nghiệm thu

- [ ] Hỏi về một sản phẩm hết hàng, tắt mạng để ép fallback → câu trả lời vẫn có lối ra cho khách
- [ ] Gửi một câu bức xúc → UI hiện khối liên hệ nhân viên
- [ ] `analyzeSentiment` giải thích được: với bất kỳ câu nào, `signals` chỉ ra chính xác vì sao ra
      nhãn đó

---

## TASK 4 — Cần Dũng quyết định trước khi làm

**`clearChat` đang chết cả hai đầu.** Backend validate payload rồi trả
`'Đã xóa lịch sử phiên chat.'` mà không xóa gì, vì server không lưu gì. Frontend export
`clearChatHistory` trong `chatApi.js` nhưng `chatbox.jsx` không hề import. Lịch sử chat chỉ nằm
trong React state nên F5 là mất sạch.

Thầy đã báo trước hội đồng sẽ bắt mở source code. Hai lựa chọn:

**Phương án A — Bỏ endpoint (30 phút).** Xóa `clearChat` khỏi controller và router, xóa
`clearChatHistory` khỏi `chatApi.js`. Sạch sẽ, không có mã chết. Đánh đổi: mất lịch sử khi F5, và
không có dữ liệu hội thoại để đánh giá ở Chương 3.

**Phương án B — Lưu hội thoại thật (nửa ngày).** Thêm model `be/models/chatmessage.js`
(`chatSessionId`, `visitorId`, `userId`, `role`, `content`, `intent`, `sentiment`, TTL 30 ngày như
`customerbehavior`). `clearChat` xóa theo `chatSessionId`. Được thêm: lịch sử sống qua F5, và
**có dữ liệu thật để viết mục đánh giá chatbot ở Chương 3** — mà mục đó bắt buộc phải có, vì
Chương 3 đã có `3.3.3 Đánh giá chức năng xử lý hóa đơn bằng AI` thì chatbot cần mục tương đương.

Nghiêng về **B**, vì nó giải quyết luôn nhu cầu số liệu cho quyển. Nhưng đây là quyết định về phạm
vi, cần Dũng chốt.

---

## Việc nhỏ gom kèm

- `fe/src/components/chatbox.jsx` gửi trường `chatSessionId` lên `POST /chat/send`, nhưng
  `validateChatSendPayload` không đọc trường này nên nó bị bỏ lặng lẽ. Chọn một: thêm vào validator
  (nếu làm Phương án B thì bắt buộc thêm) hoặc bỏ khỏi payload frontend.
- `be/services/geminiChat.js`: chuỗi hardcode `'... đúng danh sách 11 intent ...'` sẽ sai sau
  Task 1. Đã nêu ở mục 1.1, nhắc lại để không quên.

---

## Thứ tự thực hiện và định nghĩa hoàn thành

| Thứ tự | Task | Ước lượng | Ghi chú |
|---|---|---|---|
| 1 | Task 1 — intent | nửa buổi | Rủi ro thấp, ăn điểm demo ngay |
| 2 | Task 2 — sự kiện hành vi | nửa buổi | Độc lập với Task 1 |
| 3 | Task 3 — cảm xúc + hết hàng | 1 ngày | Phụ thuộc Task 1 |
| 4 | Task 4 | chờ quyết định | — |

**Toàn bộ spec coi là hoàn thành khi:**

- [ ] `npm test` xanh ở cả `be/`, `fe/`, `ad/`
- [ ] `npm run lint` xanh ở `fe/`, `ad/`
- [ ] Bấm đủ 12 nút gợi ý trên UI thật, không nút nào ra `out_of_scope`
- [ ] Collection `customerbehaviors` có đủ document của cả 5 loại sự kiện
- [ ] Kịch bản hết hàng không bao giờ dừng ở một câu thông báo cụt
- [ ] **Ghi lại các lỗi phát hiện trong lúc làm** vào một mục riêng — Chương 3 của quyển cần bảng
      kiểm thử có lỗi thật, không được toàn "Đạt". Thầy nói rõ: *"kiểm thử cứ 100 cái thì qua 97 cái
      thì hóa ra lập trình siêu đẳng không có bị lỗi gì"*.

## Kết quả Task 4 — phương án B (06/09/2026)

- Lưu hai tin nhắn mỗi lượt vào `chatmessages`, TTL 30 ngày; `userId` lấy từ cookie xác thực.
- `GET /chat/history` trả tối đa 100 tin nhắn gần nhất, theo thứ tự hội thoại. `DELETE /chat/clear` xóa theo `chatSessionId`, `visitorId` và tài khoản hiện tại.
- Frontend giữ mã phiên trong localStorage, tải nội dung khi mount và xóa qua API. Không lưu thêm snapshot sản phẩm, không thêm dashboard hay metadata `historySaved`.
- Kiểm thử mục tiêu: backend 15/15; frontend 8/8. Lint frontend không có lỗi; còn hai warning hook có sẵn ở `product.jsx`. Chưa xác minh bằng trình duyệt thật.

Lỗi phát hiện và sửa trong Task 4:

| Lỗi | Cách xử lý |
|---|---|
| Xóa UI dù API xóa trả lỗi | Chỉ reset sau response thành công; giữ hội thoại khi lỗi |
| Guest có thể đọc tin nhắn tài khoản nếu giữ cùng mã visitor | Lọc thêm `userId` trên cả đọc và xóa |
| Lỗi ghi DB bị nuốt nhưng vẫn trả thành công | Trả lỗi API theo luồng xử lý lỗi sẵn có |
| Tải lịch sử chậm có thể ghi đè tin vừa gửi | Chờ tải xong trước khi cho gửi/xóa |
