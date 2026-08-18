import { useState, useEffect, useCallback, useMemo } from "react";
import { DataGrid } from "@mui/x-data-grid";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Checkbox,
  Chip,
  Typography,
  Snackbar,
  Alert,
  TextField,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import InventoryIcon from "@mui/icons-material/Inventory";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import ShoppingCartCheckoutIcon from "@mui/icons-material/ShoppingCartCheckout";
import PersonIcon from "@mui/icons-material/Person";
import DisplaySettingsIcon from "@mui/icons-material/DisplaySettings";
import TocIcon from "@mui/icons-material/Toc";
import {
  deleteAccountUser,
  getAccountPermissionCatalog,
  getAccountUsers,
  saveAccountUser,
} from "../api/accountApi";
import { usePermissions } from "../context/usepermissions";
import "./style/account.css";

const PERMISSION_COLUMNS = [
  { key: "view", label: "Xem" },
  { key: "create", label: "Tạo mới" },
  { key: "edit", label: "Cập nhật" },
  { key: "delete", label: "Xóa" },
  { key: "excel", label: "Excel" },
  { key: "scan_ai", label: "Quét AI" },
  { key: "manage", label: "Quản lý" },
];

const MODULE_ICONS = {
  product: <InventoryIcon fontSize="small" />,
  order: <ShoppingCartIcon fontSize="small" />,
  iporder: <AddShoppingCartIcon fontSize="small" />,
  eporder: <ShoppingCartCheckoutIcon fontSize="small" />,
  customer: <PersonIcon fontSize="small" />,
  storefront: <DisplaySettingsIcon fontSize="small" />,
  history: <TocIcon fontSize="small" />,
  activitylog: <TocIcon fontSize="small" />,
};

const ROLE_LEVELS = {
  staff: 1,
  admin: 2,
  superadmin: 3,
};

const canViewRole = (viewerRole, targetRole) => {
  const viewerLevel = ROLE_LEVELS[viewerRole];
  const targetLevel = ROLE_LEVELS[targetRole];
  return viewerLevel !== undefined && targetLevel !== undefined && targetLevel <= viewerLevel;
};

const getActionColumnKey = (actionKey) => actionKey.split(".").pop();

const Account = () => {
  const {
    profile: currentUser,
    isAdmin,
    isSuperadmin,
    refreshProfile,
  } = usePermissions();

  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [role, setRole] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [catalog, setCatalog] = useState([]);
  const [adminFixed, setAdminFixed] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  const currentRole = currentUser?.role || (isSuperadmin ? "superadmin" : isAdmin ? "admin" : "");

  const availableRoles = isSuperadmin
    ? [
        { value: "admin", title: "Admin", desc: "Quản trị viên hệ thống, có quyền cố định quản lý tài khoản." },
        { value: "staff", title: "Nhân viên", desc: "Chỉ có các quyền được cấp cụ thể." },
      ]
    : [
        { value: "staff", title: "Nhân viên", desc: "Chỉ có các quyền được cấp cụ thể." },
      ];

  const grantableModules = useMemo(
    () => catalog.filter((m) => m.scope === "grantable"),
    [catalog],
  );

  const getPermissionLabel = useCallback(
    (key) => {
      for (const mod of catalog) {
        for (const act of mod.actions) {
          if (act.key === key) return `${mod.label} - ${act.label}`;
        }
      }
      return key;
    },
    [catalog],
  );

  const fetchData = useCallback(async () => {
    try {
      const [usersData, catalogData] = await Promise.all([
        getAccountUsers(),
        getAccountPermissionCatalog(),
      ]);

      const roleOrder = { superadmin: 1, admin: 2, staff: 3 };
      const adminStaffUsers = usersData
        .filter((u) => (u.role === "superadmin" || u.role === "admin" || u.role === "staff") && canViewRole(currentRole, u.role))
        .sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));
      setUsers(adminStaffUsers);

      if (catalogData) {
        setCatalog(catalogData.catalog || []);
        setAdminFixed(catalogData.adminFixed || []);
        setCatalogError("");
      } else {
        setCatalogError("Không thể tải danh mục quyền.");
      }
    } catch (err) {
      setError(err.message);
      setCatalogError("Không thể tải danh mục quyền.");
    } finally {
      setCatalogLoading(false);
    }
  }, [currentRole]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEdit = (user) => {
    setSelectedUser(user);
    setName(user.name || "");
    setEmail(user.email || "");
    setPhone(user.phone || "");
    setPassword("");
    setRole(user.role);
    setPermissions(Array.isArray(user.permissions) ? [...user.permissions] : []);
    setOpen(true);
  };

  const handleOpenAdd = () => {
    setSelectedUser(null);
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRole("staff");
    setPermissions([]);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedUser(null);
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRole("");
    setPermissions([]);
  };

  const togglePermission = useCallback(
    (actionKey, moduleItem) => {
      setPermissions((prev) => {
        if (prev.includes(actionKey)) {
          const dependents = moduleItem.actions
            .filter((a) => a.dependsOn === actionKey)
            .map((a) => a.key);
          return prev.filter((p) => p !== actionKey && !dependents.includes(p));
        }
        return [...prev, actionKey];
      });
    },
    [],
  );

  const toggleModuleAll = useCallback(
    (moduleItem) => {
      setPermissions((prev) => {
        const allKeys = moduleItem.actions.map((a) => a.key);
        const allSelected = allKeys.every((k) => prev.includes(k));
        if (allSelected) {
          return prev.filter((p) => !allKeys.includes(p));
        }
        const newPerms = [...prev];
        for (const act of moduleItem.actions) {
          if (!newPerms.includes(act.key)) {
            newPerms.push(act.key);
          }
        }
        return newPerms;
      });
    },
    [],
  );

  const isActionDisabled = useCallback(
    (action, moduleItem) => {
      if (!action.dependsOn) return false;
      const depAction = moduleItem.actions.find((a) => a.key === action.dependsOn);
      if (!depAction) return false;
      return !permissions.includes(depAction.key);
    },
    [permissions],
  );

  const handleSave = async () => {
    try {
      if (!phone) {
        throw new Error("Số điện thoại không được để trống");
      }
      if (!selectedUser && !password) {
        throw new Error("Mật khẩu không được để trống");
      }
      if (!role) {
        throw new Error("Vui lòng chọn vai trò");
      }

      const grantableKeys = grantableModules.flatMap((m) => m.actions.map((a) => a.key));
      const cleanPermissions = permissions.filter((p) => grantableKeys.includes(p));

      const body = {
        name,
        email,
        phone,
        role,
        permissions: role === "admin" || role === "staff" ? cleanPermissions : [],
      };
      if (password) {
        body.password = password;
      }

      const data = await saveAccountUser({
        userId: selectedUser?._id,
        user: body,
      });
      if (selectedUser) {
        setUsers((prev) => prev.map((user) => (user._id === selectedUser._id ? data.user : user)));
        if (currentUser && selectedUser._id === currentUser._id) {
          refreshProfile();
        }
      } else {
        setUsers((prev) => [...prev, data.user]);
      }
      handleClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCloseError = () => {
    setError(null);
  };

  const handleDeleteUser = async (user) => {
    const confirmed = window.confirm(`Xóa tài khoản ${user.name || user.phone}?`);
    if (!confirmed) return;

    try {
      await deleteAccountUser(user._id);
      setUsers((prev) => prev.filter((item) => item._id !== user._id));
    } catch (err) {
      setError(err.message);
    }
  };

  const permSummary = useCallback(
    (row) => {
      if (row.role === "superadmin") return "Toàn quyền";
      const perms = Array.isArray(row.permissions) ? row.permissions : [];
      const grantableKeys = grantableModules.flatMap((m) => m.actions.map((a) => a.key));
      const grantableCount = perms.filter((p) => grantableKeys.includes(p)).length;
      if (row.role === "admin") {
        return grantableCount > 0
          ? `Quyền cố định + ${grantableCount} quyền bổ sung`
          : "Quyền cố định";
      }
      return grantableCount > 0 ? `${grantableCount} quyền` : "Chưa cấp quyền";
    },
    [grantableModules],
  );

  const permTooltip = useCallback(
    (row) => {
      if (row.role === "superadmin") return "Tài khoản Super Admin có toàn quyền hệ thống";
      const perms = Array.isArray(row.permissions) ? row.permissions : [];
      if (perms.length === 0) {
        return row.role === "admin" ? "Chỉ có quyền cố định" : "Chưa được cấp quyền nào";
      }
      return perms.map((p) => getPermissionLabel(p)).join(", ");
    },
    [getPermissionLabel],
  );

  const columns = [
    { field: "name", headerName: "Tên", flex: 1.2, minWidth: 150 },
    { field: "phone", headerName: "Số điện thoại", flex: 1, minWidth: 130 },
    { field: "email", headerName: "Email", flex: 1.5, minWidth: 200 },
    {
      field: "role",
      headerName: "Vai trò",
      flex: 0.8,
      minWidth: 110,
      renderCell: (params) => {
        const r = params.value;
        if (r === "superadmin") {
          return (
            <Chip
              label="Super Admin"
              size="small"
              sx={{
                fontWeight: 600,
                bgcolor: "#c62828",
                color: "#fff",
              }}
            />
          );
        }
        if (r === "admin") {
          return <Chip label="Admin" color="primary" variant="outlined" size="small" sx={{ fontWeight: 600 }} />;
        }
        if (r === "staff") {
          return <Chip label="Nhân viên" variant="outlined" size="small" />;
        }
        return <Chip label={r} size="small" />;
      },
    },
    {
      field: "permSummary",
      headerName: "Quyền đã cấp",
      flex: 1.5,
      minWidth: 180,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const text = permSummary(params.row);
        const tip = permTooltip(params.row);
        return (
          <Tooltip title={tip} arrow placement="top">
            <Chip
              label={text}
              size="small"
              variant="outlined"
              className="acc-perm-summary"
              sx={{ maxWidth: "100%" }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: "actions",
      headerName: "Hành động",
      flex: 1.2,
      minWidth: 180,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const targetRole = params.row.role;
        const disableEdit =
          (isAdmin && (targetRole === "superadmin" || targetRole === "admin")) ||
          (!isSuperadmin && !isAdmin);
        const canDelete = isSuperadmin && (targetRole === "admin" || targetRole === "staff");
        return (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", height: "100%" }}>
            <Button
              variant="outlined"
              size="small"
              disabled={disableEdit}
              onClick={() => handleEdit(params.row)}
            >
              Chỉnh sửa
            </Button>
            {canDelete && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={() => handleDeleteUser(params.row)}
              >
                Xóa
              </Button>
            )}
          </Box>
        );
      },
    },
  ];

  const renderRoleSelector = () => (
    <Box className="acc-dialog-section">
      <Typography className="acc-section-heading">Vai trò</Typography>
      <div className="acc-role-options">
        {availableRoles.map((r) => (
          <label
            key={r.value}
            className={`acc-role-option${role === r.value ? " acc-role-selected" : ""}`}
          >
            <input
              type="radio"
              name="role"
              value={r.value}
              checked={role === r.value}
              onChange={(e) => {
                setRole(e.target.value);
                if (e.target.value === "superadmin") {
                  setPermissions([]);
                }
              }}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            />
            <div className="acc-role-title">{r.title}</div>
            <div className="acc-role-desc">{r.desc}</div>
          </label>
        ))}
      </div>
    </Box>
  );

  const renderFixedBlock = () => {
    if (role !== "admin" || adminFixed.length === 0) return null;
    return (
      <div className="acc-fixed-block">
        <div className="acc-fixed-title">
          <LockOutlinedIcon fontSize="small" />
          Quyền cố định của Admin
        </div>
        <div className="acc-fixed-desc">
          Các quyền này được hệ thống cấp cố định cho tài khoản Admin.
        </div>
        <div className="acc-fixed-chips">
          {adminFixed.map((key) => (
            <span key={key} className="acc-action-chip acc-chip-locked">
              <LockOutlinedIcon sx={{ fontSize: 14 }} />
              {getPermissionLabel(key)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderSuperadminBlock = () => {
    if (selectedUser?.role !== "superadmin") return null;
    return (
      <div className="acc-superadmin-block">
        <div className="acc-sa-title">Super Admin</div>
        <div className="acc-sa-desc">
          Tài khoản Super Admin có toàn quyền hệ thống. Không cần cấp quyền chi tiết.
        </div>
      </div>
    );
  };

  const renderPermissionMatrix = () => {
    if (role !== "admin" && role !== "staff") return null;
    if (catalogLoading) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Đang tải danh mục quyền...
        </Typography>
      );
    }
    if (catalogError) {
      return (
        <Alert severity="error" sx={{ mt: 2 }}>
          {catalogError}
        </Alert>
      );
    }

    return (
      <Box className="acc-dialog-section">
        <Typography className="acc-section-heading">Quyền chi tiết</Typography>
        {renderFixedBlock()}
        <div className="acc-permission-table-wrap">
          <table className="acc-permission-table">
            <colgroup>
              <col className="acc-col-index-size" />
              <col className="acc-col-module-size" />
              {PERMISSION_COLUMNS.map((column) => (
                <col key={column.key} className="acc-col-action-size" />
              ))}
              <col className="acc-col-action-size" />
            </colgroup>
            <thead>
              <tr>
                <th className="acc-col-index">STT</th>
                <th className="acc-col-module">Chức năng</th>
                {PERMISSION_COLUMNS.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th>Đầy đủ</th>
              </tr>
            </thead>
            <tbody>
              {grantableModules.map((mod, index) => {
                const allKeys = mod.actions.map((a) => a.key);
                const selectedCount = allKeys.filter((k) => permissions.includes(k)).length;
                const allSelected = selectedCount === allKeys.length;
                const indeterminate = selectedCount > 0 && !allSelected;

                return (
                  <tr key={mod.key}>
                    <td className="acc-col-index">{index + 1}</td>
                    <td className="acc-col-module">
                      <span className="acc-matrix-module">
                        <span className="acc-matrix-icon">
                          {MODULE_ICONS[mod.key] || <InventoryIcon fontSize="small" />}
                        </span>
                        <span>{mod.label}</span>
                      </span>
                    </td>
                    {PERMISSION_COLUMNS.map((column) => {
                      const action = mod.actions.find((item) => getActionColumnKey(item.key) === column.key);
                      if (!action) {
                        return (
                          <td key={column.key} className="acc-empty-cell">
                            -
                          </td>
                        );
                      }

                      const disabled = isActionDisabled(action, mod);
                      const depAction = action.dependsOn
                        ? mod.actions.find((item) => item.key === action.dependsOn)
                        : null;
                      const checkbox = (
                        <Checkbox
                          size="small"
                          checked={permissions.includes(action.key)}
                          disabled={disabled}
                          onChange={() => togglePermission(action.key, mod)}
                          inputProps={{ "aria-label": `${mod.label} - ${action.label}` }}
                          sx={{ p: 0.25 }}
                        />
                      );

                      return (
                        <td key={column.key}>
                          <Tooltip
                            title={disabled ? `Cần chọn quyền ${depAction?.label || "Cập nhật"} trước` : ""}
                            arrow
                          >
                            <span className="acc-checkbox-tooltip">{checkbox}</span>
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td>
                      <Checkbox
                        size="small"
                        checked={allSelected}
                        indeterminate={indeterminate}
                        onChange={() => toggleModuleAll(mod)}
                        inputProps={{ "aria-label": `${mod.label} - Đầy đủ` }}
                        sx={{ p: 0.25 }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Box>
    );
  };

  const isEditingSuperadmin = selectedUser?.role === "superadmin";

  return (
    <Box sx={{ p: 3 }} className="admin-list-page">
      <div className="sticky-header">
        <Typography variant="h4" gutterBottom sx={{ mb: 0 }}>
          Quản lý phân quyền
        </Typography>
        <Button
          variant="contained"
          color="success"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
        >
          Thêm tài khoản
        </Button>
      </div>

      <Box
        className="admin-list-table account-list-table"
        sx={{ width: "100%", height: { xs: "calc(100dvh - 180px)", md: "auto" } }}
      >
        <DataGrid
          rows={users}
          columns={columns}
          getRowId={(row) => row._id}
          pageSize={10}
          rowsPerPageOptions={[10, 20, 50]}
          disableSelectionOnClick
          disableRowSelectionOnClick
          hideFooterSelectedRowCount
        />
      </Box>

      <Dialog
        open={open}
        onClose={handleClose}
        disableScrollLock
        fullWidth
        maxWidth="xl"
        PaperProps={{ sx: { width: "min(1280px, calc(100vw - 32px))" } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {selectedUser
            ? isEditingSuperadmin
              ? "Xem tài khoản Super Admin"
              : "Chỉnh sửa tài khoản"
            : "Thêm tài khoản mới"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1, pb: 1.5 }}>
          <Box className="acc-dialog-stack">
            <Box className="acc-dialog-section">
              <Typography className="acc-section-heading">Thông tin tài khoản</Typography>
              <div className="acc-fields-grid">
                <TextField
                  label="Họ và tên"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  disabled={isEditingSuperadmin && !isSuperadmin}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  disabled={isEditingSuperadmin && !isSuperadmin}
                />
                <TextField
                  label="Số điện thoại"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  required
                  disabled={isEditingSuperadmin && !isSuperadmin}
                />
                <TextField
                  label={selectedUser ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu"}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  required={!selectedUser}
                  disabled={isEditingSuperadmin && !isSuperadmin}
                />
              </div>
            </Box>

            {isEditingSuperadmin ? (
              renderSuperadminBlock()
            ) : (
              <>
                {renderRoleSelector()}
                {renderPermissionMatrix()}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose}>Hủy</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            disabled={isEditingSuperadmin || catalogLoading}
          >
            Lưu
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleCloseError}
      >
        <Alert onClose={handleCloseError} severity="error" sx={{ width: "100%" }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Account;
