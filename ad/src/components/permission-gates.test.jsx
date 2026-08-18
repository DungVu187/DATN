import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPermissions = vi.hoisted(() => ({
  can: vi.fn(),
  canAny: vi.fn(),
}));

vi.mock("../context/usepermissions", () => ({
  usePermissions: () => mockPermissions,
}));

import { usePermissions } from "../context/usepermissions";

const PermissionGateHarness = () => {
  const { can } = usePermissions();

  const canProductEdit = can("product.edit");
  const canProductDelete = can("product.delete");
  const canOrderEdit = can("order.edit");
  const canOrderExcel = canOrderEdit && can("order.excel");
  const canOrderScanAi = canOrderEdit && can("order.scan_ai");

  return (
    <div>
      <span>QR</span>
      {canProductEdit && <button>Cập nhật sản phẩm</button>}
      {canProductEdit && <button>Thêm ảnh</button>}
      {canProductDelete && <button>Xóa sản phẩm</button>}

      {canOrderEdit && <button>Lưu thông tin</button>}
      {canOrderEdit && <button>Thêm sản phẩm</button>}
      {canOrderEdit && <button>Sao chép đơn</button>}
      {canOrderExcel && <button>Xuất Excel</button>}
      {canOrderExcel && <button>Nhập Excel</button>}
      {canOrderExcel && <button>Tải file mẫu</button>}
      {canOrderScanAi && <button>Quét hóa đơn AI</button>}

    </div>
  );
};

const renderWithPermissions = (permissions) => {
  const granted = new Set(permissions);
  mockPermissions.can = vi.fn((permission) => granted.has(permission));
  mockPermissions.canAny = vi.fn((items) => items.some((permission) => granted.has(permission)));
  return render(<PermissionGateHarness />);
};

describe("permission gate combinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides product edit actions while keeping QR visible", () => {
    renderWithPermissions(["product.view"]);

    expect(screen.queryByRole("button", { name: "Cập nhật sản phẩm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm ảnh" })).not.toBeInTheDocument();
    expect(screen.getByText("QR")).toBeInTheDocument();
  });

  it("hides product delete action when product.delete is missing", () => {
    renderWithPermissions(["product.view", "product.edit"]);

    expect(screen.queryByRole("button", { name: "Xóa sản phẩm" })).not.toBeInTheDocument();
  });

  it("hides order write, excel, and AI actions when order.edit is missing", () => {
    renderWithPermissions(["order.excel", "order.scan_ai"]);

    expect(screen.queryByRole("button", { name: "Lưu thông tin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm sản phẩm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sao chép đơn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xuất Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nhập Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quét hóa đơn AI" })).not.toBeInTheDocument();
  });

  it("shows order excel actions only with order.edit and order.excel", () => {
    renderWithPermissions(["order.edit", "order.excel"]);

    expect(screen.getByRole("button", { name: "Xuất Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhập Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải file mẫu" })).toBeInTheDocument();
  });

  it("shows order AI action only with order.edit and order.scan_ai", () => {
    renderWithPermissions(["order.edit", "order.scan_ai"]);

    expect(screen.getByRole("button", { name: "Quét hóa đơn AI" })).toBeInTheDocument();
  });

});
