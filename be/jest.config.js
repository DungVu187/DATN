// Cấu hình Jest cho backend (be)
// Lưu ý: các test hiện tại phụ thuộc MongoDB live (mongodb://localhost:27017/EcomTest).
// Để không phụ thuộc DB khi kiểm thử đơn thuần, các test tương lai nên dùng in-memory
// (vd mongodb-memory-server) hoặc mock. Tạm thời giữ cấu hình tối thiểu này để chạy
// bộ test auth hiện có.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Đảm bảo các biến môi trường test không trigger kết nối DB trong index.js
  // (index.js đã guard: NODE_ENV !== 'test' thì mới connect Mongo + listen)
  setupFiles: ['<rootDir>/tests/setup.env.js'],
  // Tránh file index.js bị cache trạng thái giữa các test suite
  clearMocks: true,
  restoreMocks: true,
  // forceExit + detectOpenHandles giữ ở đây để an toàn
  forceExit: true,
  detectOpenHandles: true,
  // Chạy tuần tự (tương đương --runInBand) để tránh tranh chấp DB test chung.
  // Lưu ý: 'runInBand' là CLI flag, KHÔNG phải config option.
  maxWorkers: 1,
};