import { describe, expect, it } from "vitest";
import {
  buildActivityPermissionLabels,
  formatActivityValue,
  getActivityActionLabel,
} from "./activityLogFormatting";

describe("activityLogFormatting", () => {
  it("uses the exact permission labels from the admin catalog", () => {
    const permissionLabels = buildActivityPermissionLabels([
      {
        label: "Sản phẩm",
        actions: [{ key: "product.edit", label: "Sửa" }],
      },
    ]);

    expect(formatActivityValue("product.edit", {
      fieldName: "permissions",
      permissionLabels,
    })).toBe("Sản phẩm - Sửa");
  });

  it("translates homepage configuration keys with the visible UI labels", () => {
    expect(getActivityActionLabel("update_home_categories")).toBe(
      "Cập nhật danh mục trang chủ",
    );
    expect(formatActivityValue(
      "Cập nhật các trường: configured, sidebarTitle, showSidebar, showQuickCategories, items",
    )).toBe(
      "Cập nhật các trường: Dùng cấu hình thủ công, Tiêu đề menu bên trái, Hiện menu bên trái, Hiện danh mục ngang, Danh sách danh mục",
    );
  });

  it("replaces product ids with database labels", () => {
    const references = {
      products: { "67c7fc000000000000000001": "PLC-1200" },
    };

    expect(formatActivityValue("67c7fc000000000000000001", {
      fieldName: "productId",
      references,
    })).toBe("PLC-1200");
  });

  it("translates legacy function and permission values", () => {
    expect(formatActivityValue("product_management, order_management", {
      fieldName: "functions",
    })).toBe("Sản phẩm, Đơn bán hàng");
    expect(formatActivityValue("read_order, update_product", {
      fieldName: "permissions",
    })).toBe("Đơn bán hàng - Xem, Sản phẩm - Sửa");
  });
});
