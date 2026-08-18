# Nova Customer Frontend

Frontend khách hàng của hệ thống TTSmartEcomWeb, chạy bằng React và Vite.

## Yêu cầu

- Node.js 20 trở lên
- npm
- Backend chạy tại địa chỉ được cấu hình bởi `VITE_BACK_END`

## Lệnh sử dụng

- `npm install`: cài dependency.
- `npm run dev`: chạy Vite development server tại cổng 3000.
- `npm start`: tương đương `npm run dev` để giữ tương thích thao tác cũ.
- `npm test`: chạy toàn bộ Vitest một lần.
- `npm run test:watch`: chạy Vitest ở chế độ theo dõi.
- `npm run lint`: kiểm tra source bằng ESLint.
- `npm run build`: tạo production build trong thư mục `build`.
- `npm run preview`: xem thử production build.

## Biến môi trường

Tạo `fe/.env` với biến sau:

```env
VITE_BACK_END=http://localhost:5000
```
