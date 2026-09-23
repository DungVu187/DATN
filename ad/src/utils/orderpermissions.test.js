import { describe, expect, it } from "vitest";
import {
  getOrderDetailAbilities,
  isInventoryOrderDraft,
  isOwnDraft,
  isSalesOrderDraft,
} from "./orderpermissions";

const canFrom = (permissions) => (permission) => permissions.includes(permission);
const me = { _id: "user-me" };

describe("orderpermissions — trạng thái nháp", () => {
  it("đơn bán chỉ là nháp khi đang xử lý và chưa huỷ", () => {
    expect(isSalesOrderDraft({ status: "Processing", state: "Processing" })).toBe(true);
    expect(isSalesOrderDraft({ status: "Delivering", state: "Processing" })).toBe(false);
    expect(isSalesOrderDraft({ status: "Processing", state: "Cancelled" })).toBe(false);
    expect(isSalesOrderDraft(null)).toBe(false);
  });

  it("đơn nhập/xuất là nháp khi chưa hoàn tất", () => {
    expect(isInventoryOrderDraft({ status: false })).toBe(true);
    expect(isInventoryOrderDraft({ status: true })).toBe(false);
  });

  it("isOwnDraft so khớp createdBy dạng id hoặc object đã populate", () => {
    const draft = { status: false, createdBy: "user-me" };
    expect(isOwnDraft(draft, me, isInventoryOrderDraft)).toBe(true);
    expect(isOwnDraft({ ...draft, createdBy: { _id: "user-me" } }, me, isInventoryOrderDraft)).toBe(true);
    expect(isOwnDraft({ ...draft, createdBy: "other" }, me, isInventoryOrderDraft)).toBe(false);
    expect(isOwnDraft({ ...draft, createdBy: null }, me, isInventoryOrderDraft)).toBe(false);
    expect(isOwnDraft(draft, null, isInventoryOrderDraft)).toBe(false);
  });
});

describe.each([
  { module: "order", draft: { status: "Processing", state: "Processing" }, finalized: { status: "Delivering", state: "Processing" } },
  { module: "iporder", draft: { status: false }, finalized: { status: true } },
  { module: "eporder", draft: { status: false }, finalized: { status: true } },
])("getOrderDetailAbilities($module)", ({ module, draft, finalized }) => {
  const perm = (action) => `${module}.${action}`;

  it("quyền Thêm soạn được đơn nháp của mình nhưng không có quyền Sửa đầy đủ", () => {
    const abilities = getOrderDetailAbilities({
      module,
      can: canFrom([perm("view"), perm("create")]),
      profile: me,
      order: { ...draft, createdBy: "user-me" },
    });
    expect(abilities.canEditContent).toBe(true);
    expect(abilities.canAddImage).toBe(true);
    expect(abilities.canEdit).toBe(false);
    expect(abilities.canExcel).toBe(false);
    expect(abilities.canScanAi).toBe(false);
  });

  it("quyền Thêm không soạn được đơn của người khác hoặc đơn đã chốt", () => {
    const can = canFrom([perm("view"), perm("create")]);
    expect(getOrderDetailAbilities({
      module, can, profile: me, order: { ...draft, createdBy: "other" },
    }).canEditContent).toBe(false);
    expect(getOrderDetailAbilities({
      module, can, profile: me, order: { ...finalized, createdBy: "user-me" },
    }).canEditContent).toBe(false);
  });

  it("chỉ có quyền Xem thì không hiện nút sửa, thêm ảnh hay sao chép", () => {
    const abilities = getOrderDetailAbilities({
      module,
      can: canFrom([perm("view")]),
      profile: me,
      order: { ...draft, createdBy: "user-me" },
    });
    expect(abilities.canEditContent).toBe(false);
    expect(abilities.canAddImage).toBe(false);
    expect(abilities.canCopy).toBe(false);
    expect(abilities.canCreateTemplate).toBe(false);
  });

  it("sao chép đơn (= tạo đơn mới) đi theo quyền Thêm, không theo quyền Sửa", () => {
    expect(getOrderDetailAbilities({
      module, can: canFrom([perm("edit")]), profile: me, order: draft,
    }).canCopy).toBe(false);
    expect(getOrderDetailAbilities({
      module, can: canFrom([perm("create")]), profile: me, order: draft,
    }).canCopy).toBe(true);
  });

  it("quyền Sửa sửa được mọi đơn", () => {
    const abilities = getOrderDetailAbilities({
      module, can: canFrom([perm("edit")]), profile: me, order: { ...draft, createdBy: "other" },
    });
    expect(abilities.canEditContent).toBe(true);
    expect(abilities.canEdit).toBe(true);
  });
});

describe("tạo đơn liên quan phải xét quyền của module đơn đích", () => {
  it("'Xuất đơn' từ đơn nhập cần eporder.create, không phải quyền đơn nhập", () => {
    const onlyImport = getOrderDetailAbilities({
      module: "iporder",
      can: canFrom(["iporder.view", "iporder.create", "iporder.edit"]),
      profile: me,
      order: { status: false },
    });
    expect(onlyImport.canCreateRelatedOrder).toBe(false);

    const withExport = getOrderDetailAbilities({
      module: "iporder",
      can: canFrom(["iporder.view", "eporder.create"]),
      profile: me,
      order: { status: false },
    });
    expect(withExport.canCreateRelatedOrder).toBe(true);
  });

  it("'Nhập đơn' từ đơn xuất cần iporder.create", () => {
    expect(getOrderDetailAbilities({
      module: "eporder",
      can: canFrom(["eporder.view", "eporder.create", "eporder.edit"]),
      profile: me,
      order: { status: false },
    }).canCreateRelatedOrder).toBe(false);
    expect(getOrderDetailAbilities({
      module: "eporder",
      can: canFrom(["eporder.view", "iporder.create"]),
      profile: me,
      order: { status: false },
    }).canCreateRelatedOrder).toBe(true);
  });

  it("module không hợp lệ thì báo lỗi rõ ràng", () => {
    expect(() => getOrderDetailAbilities({ module: "abc", can: () => true, profile: me, order: {} }))
      .toThrow("Module đơn không hợp lệ");
  });
});
