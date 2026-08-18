import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockPermissions = vi.hoisted(() => ({
  profile: { _id: "me1", name: "Admin User", role: "superadmin" },
  role: "superadmin",
  isAdmin: false,
  isSuperadmin: true,
  isAdminOrSuperadmin: true,
  can: vi.fn().mockReturnValue(true),
  canAny: vi.fn().mockReturnValue(true),
  canAll: vi.fn().mockReturnValue(true),
  refreshProfile: vi.fn(),
  isLoading: false,
  permissions: [],
}));

vi.mock("../context/usepermissions", () => ({
  usePermissions: () => mockPermissions,
}));

vi.mock("@mui/x-data-grid", () => ({
  DataGrid: ({ rows, columns }) => (
    <table data-testid="users-grid">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.field}>{c.headerName}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row._id} data-testid={`row-${row._id}`}>
            {columns.map((c) => (
              <td key={c.field}>
                {c.renderCell
                  ? c.renderCell({ value: row[c.field], row })
                  : row[c.field] || ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

const MOCK_CATALOG = {
  success: true,
  catalog: [
    {
      key: "product",
      label: "San pham",
      group: "products",
      scope: "grantable",
      actions: [
        { key: "product.view", label: "Xem" },
        { key: "product.create", label: "Them" },
        { key: "product.edit", label: "Sua" },
        { key: "product.delete", label: "Xoa" },
      ],
    },
    {
      key: "order",
      label: "Don ban hang",
      group: "orders",
      scope: "grantable",
      actions: [
        { key: "order.view", label: "Xem" },
        { key: "order.create", label: "Tao" },
        { key: "order.edit", label: "Sua" },
        { key: "order.delete", label: "Xoa" },
        { key: "order.excel", label: "Excel", dependsOn: "order.edit" },
        { key: "order.scan_ai", label: "Quet AI", dependsOn: "order.edit" },
      ],
    },
    {
      key: "account",
      label: "Phan quyen",
      group: "admin",
      scope: "adminFixed",
      actions: [{ key: "account.manage", label: "Quan ly" }],
    },
    {
      key: "activitylog",
      label: "Lich su hoat dong",
      group: "admin",
      scope: "grantable",
      actions: [{ key: "activitylog.view", label: "Xem" }],
    },
  ],
  adminFixed: ["account.manage"],
};

const MOCK_USERS = [
  { _id: "u1", name: "Super", phone: "0001", email: "s@t.c", role: "superadmin", permissions: [] },
  { _id: "u2", name: "Admin1", phone: "0002", email: "a@t.c", role: "admin", permissions: ["product.view"] },
  { _id: "u3", name: "Staff1", phone: "0003", email: "st@t.c", role: "staff", permissions: ["order.view", "order.edit"] },
];

const setupFetch = (overrides = {}) => {
  globalThis.fetch = vi.fn((url) => {
    if (url.includes("/users/all-users")) {
      return Promise.resolve({
        ok: true,
        json: async () => overrides.users || MOCK_USERS,
      });
    }
    if (url.includes("/users/permission-catalog")) {
      return Promise.resolve({
        ok: true,
        json: async () => overrides.catalog || MOCK_CATALOG,
      });
    }
    if (url.includes("/users/admin-create") || url.includes("/permissions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          user: { _id: "new1", name: "New", phone: "9999", role: "staff", permissions: ["product.view"] },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
};

const getDialog = () => {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const dlg = dialogs[dialogs.length - 1];
  return dlg ? within(dlg) : null;
};

import Account from "./account";

describe("Account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions.profile = { _id: "me1", name: "Admin User", role: "superadmin" };
    mockPermissions.role = "superadmin";
    mockPermissions.isAdmin = false;
    mockPermissions.isSuperadmin = true;
    mockPermissions.isAdminOrSuperadmin = true;
    setupFetch();
  });

  it("renders catalog modules in the dialog", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    await waitFor(() => expect(screen.getByText("San pham")).toBeInTheDocument());
    expect(screen.getByText("Don ban hang")).toBeInTheDocument();
    expect(screen.getByText("Lich su hoat dong")).toBeInTheDocument();
    expect(screen.getByText("Tạo mới")).toBeInTheDocument();
    expect(screen.getByText("Cập nhật")).toBeInTheDocument();
    const dialog = getDialog();
    expect(dialog.getByLabelText("San pham - Xem")).toBeInTheDocument();
    expect(dialog.getByLabelText("San pham - Them")).toBeInTheDocument();
    expect(dialog.getByLabelText("San pham - Sua")).toBeInTheDocument();
    expect(dialog.getByLabelText("San pham - Xoa")).toBeInTheDocument();
    expect(dialog.getByLabelText("Lich su hoat dong - Xem")).toBeInTheDocument();
  });

  it("selects and deselects all permissions for a module", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    await waitFor(() => expect(screen.getByText("San pham")).toBeInTheDocument());

    const dialog = getDialog();
    const selectAllCheckbox = dialog.getByLabelText("San pham - Đầy đủ");
    const xemCheckbox = dialog.getByLabelText("San pham - Xem");

    fireEvent.click(selectAllCheckbox);
    expect(xemCheckbox).toBeChecked();

    fireEvent.click(selectAllCheckbox);
    expect(xemCheckbox).not.toBeChecked();
  });

  it("disables dependent action when dependency not selected", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    await waitFor(() => expect(screen.getByText("Don ban hang")).toBeInTheDocument());

    const dialog = getDialog();
    expect(dialog.getByLabelText("Don ban hang - Excel")).toBeDisabled();
    expect(dialog.getByLabelText("Don ban hang - Quet AI")).toBeDisabled();
  });

  it("enables dependent action after selecting dependency", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    await waitFor(() => expect(screen.getByText("Don ban hang")).toBeInTheDocument());

    const dialog = getDialog();
    let excelCheckbox = dialog.getByLabelText("Don ban hang - Excel");
    let scanCheckbox = dialog.getByLabelText("Don ban hang - Quet AI");
    expect(excelCheckbox.closest(".acc-checkbox-tooltip")).toBeInTheDocument();
    expect(scanCheckbox.closest(".acc-checkbox-tooltip")).toBeInTheDocument();

    fireEvent.click(dialog.getByLabelText("Don ban hang - Sua"));
    excelCheckbox = dialog.getByLabelText("Don ban hang - Excel");
    scanCheckbox = dialog.getByLabelText("Don ban hang - Quet AI");
    expect(excelCheckbox).not.toBeDisabled();
    expect(scanCheckbox).not.toBeDisabled();
    expect(excelCheckbox.closest(".acc-checkbox-tooltip")).toBeInTheDocument();
    expect(scanCheckbox.closest(".acc-checkbox-tooltip")).toBeInTheDocument();
  });

  it("auto-removes dependent when dependency is unchecked", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    await waitFor(() => expect(screen.getByText("Don ban hang")).toBeInTheDocument());

    const dialog = getDialog();
    const orderSua = dialog.getByLabelText("Don ban hang - Sua");

    fireEvent.click(orderSua);
    let excelCheckbox = dialog.getByLabelText("Don ban hang - Excel");
    fireEvent.click(excelCheckbox);
    expect(excelCheckbox).toBeChecked();

    fireEvent.click(orderSua);
    excelCheckbox = dialog.getByLabelText("Don ban hang - Excel");
    expect(excelCheckbox).not.toBeChecked();
    expect(excelCheckbox).toBeDisabled();
  });

  it("shows fixed admin permissions block for admin role", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    const dialog = getDialog();
    await waitFor(() => expect(dialog.getByText("Nhân viên")).toBeInTheDocument());

    const adminOption = dialog.getByText("Admin").closest("label");
    fireEvent.click(adminOption);

    await waitFor(() =>
      expect(screen.getByText("Quyền cố định của Admin")).toBeInTheDocument()
    );

    expect(screen.getByText("Phan quyen - Quan ly")).toBeInTheDocument();
    expect(screen.queryByText("Lich su hoat dong - Xem")).not.toBeInTheDocument();
  });

  it("does not show fixed block for staff role", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    await waitFor(() => expect(screen.getByText("San pham")).toBeInTheDocument());

    expect(screen.queryByText("Quyền cố định của Admin")).not.toBeInTheDocument();
  });

  it("does not send functions or adminFixed in save payload", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    await waitFor(() => expect(screen.getByText("San pham")).toBeInTheDocument());

    const dialog = getDialog();
    const phoneInput = dialog.getByLabelText("Số điện thoại *");
    fireEvent.change(phoneInput, { target: { value: "0999888777" } });

    const passInput = dialog.getByLabelText("Mật khẩu *");
    fireEvent.change(passInput, { target: { value: "123456" } });

    fireEvent.click(dialog.getByLabelText("San pham - Xem"));
    fireEvent.click(dialog.getByLabelText("Lich su hoat dong - Xem"));

    fireEvent.click(dialog.getByText("Lưu"));

    await waitFor(() => {
      const createCall = globalThis.fetch.mock.calls.find((c) =>
        c[0].includes("/users/admin-create")
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(createCall[1].body);
      expect(body.permissions).toContain("product.view");
      expect(body.permissions).toContain("activitylog.view");
      expect(body.functions).toBeUndefined();
      expect(body.permissions).not.toContain("account.manage");
    });
  });

  it("hides higher role account rows for admin user", async () => {
    mockPermissions.profile = { _id: "me2", name: "Admin User", role: "admin" };
    mockPermissions.role = "admin";
    mockPermissions.isAdmin = true;
    mockPermissions.isSuperadmin = false;

    render(<Account />);

    await waitFor(() => expect(screen.getByTestId("row-u2")).toBeInTheDocument());
    expect(screen.queryByTestId("row-u1")).not.toBeInTheDocument();
    expect(screen.getByTestId("row-u3")).toBeInTheDocument();
  });

  it("shows Admin and Nhan vien roles for superadmin user", async () => {
    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    const roleOptions = document.querySelectorAll(".acc-role-option .acc-role-title");
    const roleTexts = Array.from(roleOptions).map((el) => el.textContent);
    expect(roleTexts).toContain("Admin");
    expect(roleTexts).toContain("Nhân viên");
  });

  it("shows only Nhan vien role for admin user", async () => {
    mockPermissions.role = "admin";
    mockPermissions.isAdmin = true;
    mockPermissions.isSuperadmin = false;

    render(<Account />);

    await waitFor(() => expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Thêm tài khoản"));

    const roleOptions = document.querySelectorAll(".acc-role-option .acc-role-title");
    const roleTexts = Array.from(roleOptions).map((el) => el.textContent);
    expect(roleTexts).toContain("Nhân viên");
    expect(roleTexts).not.toContain("Admin");
  });
});
