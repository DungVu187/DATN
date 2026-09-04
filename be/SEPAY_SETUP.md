# SePay payment setup

Checkout hỗ trợ hai phương thức ở storefront:

- `COD`: tạo đơn và chờ thu tiền khi giao hàng.
- `SEPAY`: tạo đơn `PENDING`, hiển thị VietQR và tự chuyển `PAID` khi webhook nhận đủ tiền.

## Backend environment

Copy các biến sau vào `be/.env` và thay bằng thông tin tài khoản thật của bạn:

```env
SEPAY_BANK_CODE=MB
SEPAY_ACCOUNT_NUMBER=0123456789
SEPAY_ACCOUNT_NAME=NGUYEN VAN A
SEPAY_WEBHOOK_API_KEY=your-long-random-webhook-key
SEPAY_PAYMENT_PREFIX=NOVA
SEPAY_PAYMENT_EXPIRES_MINUTES=30
SEPAY_QR_TEMPLATE=compact
```

Với VietinBank (`SEPAY_BANK_CODE=ICB`), hệ thống tự thêm tiền tố `SEVQR` vào nội dung QR theo yêu cầu của SePay. Mã `NOVA...` của đơn vẫn được giữ để webhook ghép đúng giao dịch.

Không đưa `SEPAY_WEBHOOK_API_KEY` vào frontend hoặc commit file `be/.env`.

## Webhook dashboard

Trong SePay, tạo webhook cho giao dịch tiền vào:

```text
POST https://your-domain.example/payments/sepay/webhook
```

Chọn xác thực API Key và dùng đúng giá trị `SEPAY_WEBHOOK_API_KEY`. Backend chấp nhận header dạng `Authorization: Apikey <key>` hoặc `Authorization: Bearer <key>`.

Webhook chỉ xác nhận khi:

1. Giao dịch là tiền vào (`transferType = in`).
2. Nội dung có mã `NOVA...` của đơn hàng.
3. Số tiền nhận lớn hơn hoặc bằng số tiền đơn.
4. Đơn chưa bị hủy và giao dịch chưa từng xử lý.

Giao dịch thiếu tiền được lưu là `UNDERPAID`; giao dịch không ghép được đơn sẽ được phản hồi thành công nhưng không cập nhật đơn.

## Test mode

Khi đang phát triển, bật Test Mode trên SePay và dùng webhook/token của Test Mode. Sau khi luồng chạy ổn:

1. Tắt Test Mode.
2. Tạo webhook Live mới.
3. Đặt một đơn có giá trị nhỏ.
4. Dùng tài khoản ngân hàng khác quét QR và chuyển khoản thật.
5. Kiểm tra giao dịch vào tài khoản và đơn chuyển sang `PAID`.

Test Mode và Live Mode không dùng chung giao dịch hoặc cấu hình webhook.

## Order lifecycle

- Đơn `COD` thông báo ngay cho admin khi được tạo.
- Đơn `SEPAY` ở trạng thái `PENDING` và chỉ gửi email/thông báo admin sau khi webhook xác nhận `PAID`.
- Tác vụ nền chạy mỗi phút, tự đổi đơn `SEPAY` quá `SEPAY_PAYMENT_EXPIRES_MINUTES` sang `EXPIRED`, hủy đơn và trả tồn kho.

## Local development

Webhook phải truy cập được từ Internet. Khi chạy local, dùng Cloudflare Tunnel hoặc tên miền đã trỏ tới backend. Route webhook không yêu cầu đăng nhập người dùng.
