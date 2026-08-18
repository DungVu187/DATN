
import React, { useState, useEffect } from "react";
import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Stack,
} from "@mui/material";
import toast from "react-hot-toast";
import {
  deleteCustomer,
  getCustomerUsers,
  registerCustomer,
  updateCustomer,
} from "../api/customersAdministrationApi";
import { usePermissions } from "../context/usepermissions";

const Customers = () => {
  const { can } = usePermissions();
  const canCreate = can("customer.create");
  const canEdit = can("customer.edit");
  const canDelete = can("customer.delete");
  const [users, setUsers] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [, setLoading] = useState(false);


  // Sửa thông tin khách hàng
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: "", phone: "", email: "" });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getCustomerUsers();
      setUsers(data);
    } catch (error) {
      console.error("Lỗi khi tải users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const field = e.target.name?.replace("register-", "");
    if (!field) return;
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleRegister = async () => {
    if (formData.password !== formData.confirmPassword) {
      alert("Mật khẩu không khớp");
      return;
    }

    if (!formData.phone || !formData.password) {
      alert("Thiếu SĐT hoặc mật khẩu");
      return;
    }

    try {
      await registerCustomer({
        name: formData.name,
        phone: formData.phone,
        password: formData.password,
      });
      handleCloseDialog();
      toast.success("Thêm người dùng thành công");
      fetchUsers();
    } catch (error) {
      alert(error.message || "Đăng ký thất bại");
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setFormData({ name: "", phone: "", password: "", confirmPassword: "" });
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Bạn có chắc muốn xóa người dùng ${user.name}?`))
      return;
    try {
      await deleteCustomer(user._id);
      toast.success("Đã xóa người dùng");
      fetchUsers();
    } catch (err) {
      toast.error(err.message || "Lỗi khi xóa người dùng");
    }
  };



  // Mở dialog sửa thông tin
  const handleOpenEditDialog = (user) => {
    setEditUser(user);
    setEditFormData({
      name: user.name || "",
      phone: user.phone || "",
      email: user.email || "",
    });
    setOpenEditDialog(true);
  };

  // Lưu thông tin đã sửa
  const handleSaveEdit = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      await updateCustomer(editUser._id, {
        name: editFormData.name,
        phone: editFormData.phone,
        email: editFormData.email,
      });
      toast.success("Cập nhật thông tin thành công");
      setOpenEditDialog(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || "Lỗi khi cập nhật");
    } finally {
      setEditLoading(false);
    }
  };

  // Reset mật khẩu về 123456
  const handleResetPassword = async () => {
    if (!editUser) return;
    if (!window.confirm(`Bạn có chắc muốn reset mật khẩu của ${editUser.name || editUser.phone} về 123456?`)) return;
    setEditLoading(true);
    try {
      await updateCustomer(editUser._id, { password: "123456" }, "Reset thất bại");
      toast.success("Đã reset mật khẩu về 123456");
      setOpenEditDialog(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || "Lỗi khi reset mật khẩu");
    } finally {
      setEditLoading(false);
    }
  };


  return (
    <Box p={3} className="admin-list-page">
      <div className="sticky-header">
        <Typography variant="h4" gutterBottom>
          Quản lý khách hàng
        </Typography>
        {canCreate && (
          <Button
            variant="contained"
            color="primary"
            onClick={() => setOpenDialog(true)}
          >
            Thêm người dùng mới
          </Button>
        )}
      </div>

      <TableContainer component={Paper} className="admin-list-table">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tên</TableCell>
              <TableCell>SĐT</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Tác vụ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <React.Fragment key={user._id}>
                <TableRow>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.phone}</TableCell>
                  <TableCell>{user.email || "-"}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {canEdit && (
                        <Button
                          variant="contained"
                          size="small"
                          color="info"
                          onClick={() => handleOpenEditDialog(user)}
                        >
                          Sửa
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="contained"
                          size="small"
                          color="error"
                          onClick={() => handleDeleteUser(user)}
                        >
                          Xóa
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog tạo user */}
      <Dialog open={openDialog} onClose={handleCloseDialog} disableScrollLock>
        <DialogTitle>Đăng ký người dùng</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ minWidth: 300 }}>
            <TextField
              label="Tên"
              name="register-name"
              value={formData.name}
              onChange={handleInputChange}
              size="small"
            />
            <TextField
              label="SĐT"
              name="register-phone"
              value={formData.phone}
              onChange={handleInputChange}
              size="small"
            />
            <TextField
              label="Mật khẩu"
              name="register-password"
              type="password"
              value={formData.password}
              onChange={handleInputChange}
              size="small"
            />
            <TextField
              label="Xác nhận mật khẩu"
              name="register-confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Hủy</Button>
          <Button onClick={handleRegister} variant="contained">
            Đăng ký
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog sửa thông tin khách hàng */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} disableScrollLock>
        <DialogTitle>Sửa thông tin khách hàng</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ minWidth: 300, mt: 1 }}>
            <TextField
              label="Tên"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              size="small"
              fullWidth
            />
            <TextField
              label="SĐT"
              value={editFormData.phone}
              onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
              size="small"
              fullWidth
            />
            <TextField
              label="Email"
              value={editFormData.email}
              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
              size="small"
              fullWidth
            />
            <Button
              variant="outlined"
              color="warning"
              onClick={handleResetPassword}
              disabled={editLoading}
              sx={{ textTransform: "none" }}
            >
              Reset mật khẩu về 123456
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditDialog(false)}>Hủy</Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            disabled={editLoading}
          >
            {editLoading ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Customers;
