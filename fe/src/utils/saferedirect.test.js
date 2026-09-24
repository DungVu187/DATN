import { describe, expect, it } from "vitest";
import { getSafeRedirectPath } from "./saferedirect";

describe("getSafeRedirectPath", () => {
  it("giữ nguyên đường dẫn nội bộ kèm query và hash", () => {
    expect(getSafeRedirectPath("/product/123?variant=2#reviews")).toBe("/product/123?variant=2#reviews");
    expect(getSafeRedirectPath("/cart")).toBe("/cart");
  });

  it("chặn URL ngoài và các biến thể vượt qua kiểm tra dấu /", () => {
    [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "/\t/evil.com",
      "evil.com/path",
    ].forEach((value) => expect(getSafeRedirectPath(value)).toBe("/"));
  });

  it("dùng trang mặc định khi thiếu tham số hoặc trỏ về chính trang đăng nhập", () => {
    expect(getSafeRedirectPath(null)).toBe("/");
    expect(getSafeRedirectPath("")).toBe("/");
    expect(getSafeRedirectPath("/login?redirect=/cart")).toBe("/");
    expect(getSafeRedirectPath(undefined, "/myorder")).toBe("/myorder");
  });
});
