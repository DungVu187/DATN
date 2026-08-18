# Backend Test Baseline (ngày thiết lập: Giai đoạn 0)

Baseline chụp tại commit thiết lập `jest.config.js` (nhánh `fix/production-readiness`).
Mục đích: làm mốc regression cho các fix ở Giai đoạn 1–3. Mỗi fix không được làm
số test PASS giảm so với baseline (trừ khi cố ý cập nhật test cho đúng behavior mới).

## Kết quả baseline (`node_modules/.bin/jest` toàn bộ)

- Test suites: **7 passed / 9 total** (2 fail)
- Tests: **23 passed / 26 total** (3 fail)

## Các test FAIL (pre-existing — drift test vs code, KHÔNG do Giai đoạn 0)

| File | Test | Lý do |
|------|------|-------|
| `tests/api_product.test.js` | TC7: GET /products phân trang | Test insert 15 product rồi gọi `GET /products` không cookie, kỳ vọng trả 15. Test cũ chưa phản ánh bộ lọc hiển thị sản phẩm công khai. |
| `tests/product.test.js` | TC3: imgUrl sản phẩm tuyệt đối→tương đối | Kỳ vọng post-init hook tự chuyển `https://ttsmart.com.vn/api/images/...` → `/images/...`. Hook không chạy/không khớp `ADDRESS` → giữ nguyên URL tuyệt đối. |
| `tests/product.test.js` | TC4: imgUrl section tuyệt đối→tương đối | Tương tự TC3 cho `/section-images/...`. |

## Test PASS (7 suite, 23 test) — cần giữ xanh

- `tests/auth.test.js` (2) — login thành công set cookie, login sai 400.
- `tests/register.test.js`, `tests/user.test.js`, `tests/recover.test.js`
- `tests/admin_user_management.test.js`
- `tests/order.test.js`

## Cách chạy

```bash
cd be
node_modules/.bin/jest            # toàn bộ
node_modules/.bin/jest tests/auth.test.js   # 1 suite
```

Yêu cầu: MongoDB live tại `mongodb://localhost:27017` (DB `EcomTest`).
Tương lai nên chuyển sang `mongodb-memory-server` để CI không phụ thuộc DB live (task riêng).
