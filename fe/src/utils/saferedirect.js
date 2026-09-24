// Chỉ cho quay về đường dẫn nội bộ sau đăng nhập, chặn chuyển hướng sang trang ngoài (open redirect)
// như "https://evil.com", "//evil.com", "/\evil.com" hay "javascript:...".
export const getSafeRedirectPath = (rawValue, fallback = "/") => {
  if (typeof rawValue !== "string") return fallback;
  const value = rawValue.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Ký tự điều khiển (tab, xuống dòng...) có thể bị trình duyệt bỏ qua để tạo thành URL ngoài
  if ([...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    // Tránh vòng lặp quay lại chính trang đăng nhập
    if (url.pathname === "/login") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
};
