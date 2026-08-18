import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
} from "@mui/material";
import {
  AddRounded,
  CheckCircleRounded,
  DeleteOutlineRounded,
  EditOutlined,
  LocationOnOutlined,
  LockOutlined,
  PersonOutlineRounded,
  PhoneOutlined,
  EmailOutlined,
  RadioButtonUncheckedRounded,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import {
  deleteCustomerAddress,
  getCustomerProfile,
  saveCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerProfile,
} from "../api/customerAccountApi";
import { useLanguage } from "../context/languagecontext.jsx";
import AccountLayout from "../layout/accountlayout/accountlayout.jsx";
import "./styles/profile.css";

const Profile = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const isAddressView = new URLSearchParams(location.search).get("section") === "addresses";
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [openAddressDialog, setOpenAddressDialog] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressId, setAddressId] = useState(null);
  const [label, setLabel] = useState(() => t("construction"));
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [addressDetail, setAddressDetail] = useState("");

  useEffect(() => {
    let active = true;

    const fetchProfile = async () => {
      try {
        const response = await getCustomerProfile();

        if (!response.ok) {
          if (response.status === 401) {
            toast.error(t("session_expired", "Phiên đăng nhập đã hết hạn"));
            window.location.href = "/login?redirect=" + encodeURIComponent(window.location.pathname);
            return;
          }
          throw new Error(t("failed_to_load_profile", "Không thể tải thông tin hồ sơ"));
        }

        const data = await response.json();
        if (!active) return;
        setUser(data);
        setName(data.name || "");
        setEmail(data.email || "");
      } catch {
        if (active) toast.error(t("failed_to_load_profile", "Không thể tải thông tin hồ sơ"));
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchProfile();
    return () => {
      active = false;
    };
  }, [t]);

  const resetInfoForm = () => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setIsEditingInfo(false);
  };

  const handleUpdateInfo = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error(t("full_name_required", "Vui lòng nhập họ và tên"));
      return;
    }

    setSavingInfo(true);
    try {
      const response = await updateCustomerProfile({
        name: name.trim(),
        email: email.trim(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(t("update_failed", "Cập nhật thất bại"));

      const updatedUser = data.user || { ...user, name: name.trim(), email: email.trim() };
      setUser(updatedUser);
      setName(updatedUser.name || "");
      setEmail(updatedUser.email || "");
      setIsEditingInfo(false);
      toast.success(t("update_success", "Cập nhật thông tin thành công!"));
    } catch {
      toast.error(t("update_failed", "Cập nhật thất bại"));
    } finally {
      setSavingInfo(false);
    }
  };

  const handleOpenAddAddress = () => {
    setAddressId(null);
    setLabel(t("construction"));
    setReceiverName(user?.name || "");
    setReceiverPhone(user?.phone || "");
    setAddressDetail("");
    setOpenAddressDialog(true);
  };

  const handleOpenEditAddress = (address) => {
    setAddressId(address._id);
    setLabel(address.label || t("construction"));
    setReceiverName(address.receiverName || "");
    setReceiverPhone(address.receiverPhone || "");
    setAddressDetail(address.addressDetail || "");
    setOpenAddressDialog(true);
  };

  const handleSaveAddress = async () => {
    if (!receiverName.trim() || !receiverPhone.trim() || !addressDetail.trim()) {
      toast.error(t("fill_all_address_fields", "Vui lòng điền đầy đủ các thông tin địa chỉ!"));
      return;
    }

    setSavingAddress(true);
    try {
      const response = await saveCustomerAddress(
        addressId,
        {
          label: label.trim() || t("construction"),
          receiverName: receiverName.trim(),
          receiverPhone: receiverPhone.trim(),
          addressDetail: addressDetail.trim(),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(t("failed_to_save_address", "Không thể lưu địa chỉ"));

      setUser((currentUser) => ({ ...currentUser, addresses: data.addresses }));
      setOpenAddressDialog(false);
      toast.success(addressId ? t("update_address_success", "Cập nhật địa chỉ thành công!") : t("add_address_success", "Thêm địa chỉ thành công!"));
    } catch {
      toast.error(t("failed_to_save_address", "Không thể lưu địa chỉ"));
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (id) => {
    if (!window.confirm(t("confirm_delete_address", "Bạn có chắc chắn muốn xóa địa chỉ này?"))) return;
    try {
      const response = await deleteCustomerAddress(id);
      const data = await response.json();
      if (!response.ok) throw new Error(t("failed_to_delete_address", "Không thể xóa địa chỉ"));
      setUser((currentUser) => ({ ...currentUser, addresses: data.addresses }));
      toast.success(t("delete_address_success", "Xóa địa chỉ thành công!"));
    } catch {
      toast.error(t("failed_to_delete_address", "Không thể xóa địa chỉ"));
    }
  };

  const handleSetDefaultAddress = async (id) => {
    try {
      const response = await setDefaultCustomerAddress(id);
      const data = await response.json();
      if (!response.ok) throw new Error(t("failed_to_set_default_address", "Không thể thiết lập địa chỉ mặc định"));
      setUser((currentUser) => ({ ...currentUser, addresses: data.addresses }));
      toast.success(t("set_default_address_success", "Đã đặt làm địa chỉ mặc định!"));
    } catch {
      toast.error(t("failed_to_set_default_address", "Không thể thiết lập địa chỉ mặc định"));
    }
  };

  const renderValue = (value) => value || <span className="profile-not-updated">{t("not_updated_yet", "Chưa cập nhật")}</span>;

  return (
    <AccountLayout
      title={t("account_info", "Thông tin tài khoản")}
      description={t("account_info_description", "Quản lý thông tin liên hệ và các địa chỉ nhận hàng của bạn.")}
    >
      {loading ? (
        <div className="profile-loading"><CircularProgress size={34} /></div>
      ) : (
        <div className={"profile-content-grid" + (isAddressView ? " is-address-view" : "")}>
          <section className="profile-panel profile-personal-panel">
            <div className="profile-panel-header">
              <div className="profile-panel-title">
                <span className="profile-panel-icon"><PersonOutlineRounded /></span>
                <div>
                  <h2>{t("personal_info", "Thông tin cá nhân")}</h2>
                  <p>{t("personal_info_hint", "Thông tin dùng để liên hệ và xác nhận đơn hàng")}</p>
                </div>
              </div>
              {!isEditingInfo && (
                <button type="button" className="profile-outline-button" onClick={() => setIsEditingInfo(true)}>
                  <EditOutlined />
                  <span>{t("edit", "Chỉnh sửa")}</span>
                </button>
              )}
            </div>

            {isEditingInfo ? (
              <form className="profile-edit-form" onSubmit={handleUpdateInfo}>
                <TextField label={t("full_name", "Họ và tên")} value={name} onChange={(event) => setName(event.target.value)} fullWidth required />
                <TextField label={t("phone_number", "Số điện thoại")} value={user?.phone || ""} fullWidth disabled helperText={t("phone_number_used_for_login", "Số điện thoại dùng để đăng nhập")} />
                <TextField label={t("email_address", "Địa chỉ email")} value={email} onChange={(event) => setEmail(event.target.value)} fullWidth type="email" />
                <div className="profile-form-actions">
                  <Button variant="outlined" onClick={resetInfoForm} disabled={savingInfo}>{t("cancel", "Hủy")}</Button>
                  <Button variant="contained" type="submit" disabled={savingInfo}>{savingInfo ? t("processing", "Đang xử lý...") : t("save_changes", "Lưu thay đổi")}</Button>
                </div>
              </form>
            ) : (
              <div className="profile-info-list">
                <div className="profile-info-row">
                  <span className="profile-info-row-icon"><PersonOutlineRounded /></span>
                  <div><span>{t("full_name", "Họ và tên")}</span><strong>{renderValue(user?.name)}</strong></div>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-row-icon"><PhoneOutlined /></span>
                  <div><span>{t("phone_number", "Số điện thoại")}</span><strong>{renderValue(user?.phone)}</strong></div>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-row-icon"><EmailOutlined /></span>
                  <div><span>{t("email_address", "Địa chỉ email")}</span><strong>{renderValue(user?.email)}</strong></div>
                </div>
              </div>
            )}

            <div className="profile-security-strip">
              <span className="profile-security-icon"><LockOutlined /></span>
              <div>
                <strong>{t("account_security", "Bảo mật tài khoản")}</strong>
                <span>{t("change_password_regularly", "Đổi mật khẩu định kỳ để bảo vệ tài khoản của bạn.")}</span>
              </div>
              <Link to="/change-password">{t("change_password", "Đổi mật khẩu")}</Link>
            </div>
          </section>

          <section className="profile-panel profile-address-panel" id="addresses">
            <div className="profile-panel-header">
              <div className="profile-panel-title">
                <span className="profile-panel-icon"><LocationOnOutlined /></span>
                <div>
                  <h2>{t("address_book", "Sổ địa chỉ công trình / nhận hàng")}</h2>
                  <p>{t("address_book_hint", "Lưu địa chỉ để đặt hàng nhanh hơn")}</p>
                </div>
              </div>
              <button type="button" className="profile-outline-button" onClick={handleOpenAddAddress}>
                <AddRounded />
                <span>{t("add_address", "Thêm địa chỉ")}</span>
              </button>
            </div>

            {!user?.addresses?.length ? (
              <div className="profile-address-empty">
                <div className="profile-address-illustration">
                  <span className="profile-map-line line-one" />
                  <span className="profile-map-line line-two" />
                  <LocationOnOutlined />
                </div>
                <h3>{t("no_saved_address_title", "Chưa có địa chỉ nhận hàng nào")}</h3>
                <p>{t("no_addresses_saved", "Địa chỉ nhận hàng đầu tiên sẽ được tự động lưu vào đây.")}</p>
                <button type="button" className="profile-primary-button" onClick={handleOpenAddAddress}>
                  <AddRounded />
                  {t("add_new_address", "Thêm địa chỉ mới")}
                </button>
              </div>
            ) : (
              <div className="profile-address-list">
                {user.addresses.map((address) => (
                  <article className={"profile-address-card" + (address.isDefault ? " is-default" : "")} key={address._id}>
                    <button type="button" className="profile-default-toggle" onClick={() => !address.isDefault && handleSetDefaultAddress(address._id)} aria-label={t("set_default", "Đặt làm mặc định")}>
                      {address.isDefault ? <CheckCircleRounded /> : <RadioButtonUncheckedRounded />}
                    </button>
                    <div className="profile-address-body">
                      <div className="profile-address-heading">
                        <h3>{address.label || t("construction", "Công trình")}</h3>
                        {address.isDefault && <span>{t("default", "Mặc định")}</span>}
                      </div>
                      <p className="profile-address-receiver">{address.receiverName} · {address.receiverPhone}</p>
                      <p className="profile-address-detail">{address.addressDetail}</p>
                    </div>
                    <div className="profile-address-actions">
                      <IconButton size="small" onClick={() => handleOpenEditAddress(address)} aria-label={t("edit", "Chỉnh sửa")}><EditOutlined fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteAddress(address._id)} disabled={address.isDefault && user.addresses.length > 1} aria-label={t("delete", "Xóa")}><DeleteOutlineRounded fontSize="small" /></IconButton>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={openAddressDialog} onClose={() => !savingAddress && setOpenAddressDialog(false)} fullWidth maxWidth="sm" className="profile-address-dialog">
        <DialogTitle>{addressId ? t("edit_construction_address", "Chỉnh sửa địa chỉ công trình") : t("add_construction_address", "Thêm địa chỉ công trình mới")}</DialogTitle>
        <DialogContent>
          <Box className="profile-dialog-fields">
            <TextField label={t("address_label_placeholder", "Tên gợi nhớ")} value={label} onChange={(event) => setLabel(event.target.value)} fullWidth />
            <TextField label={t("receiver_name", "Tên người nhận thiết bị")} value={receiverName} onChange={(event) => setReceiverName(event.target.value)} fullWidth required />
            <TextField label={t("receiver_phone", "Số điện thoại người nhận")} value={receiverPhone} onChange={(event) => setReceiverPhone(event.target.value)} fullWidth required />
            <TextField label={t("address_detail_label", "Địa chỉ chi tiết công trình nhận hàng")} value={addressDetail} onChange={(event) => setAddressDetail(event.target.value)} fullWidth multiline rows={3} required />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddressDialog(false)} disabled={savingAddress}>{t("cancel", "Hủy")}</Button>
          <Button variant="contained" onClick={handleSaveAddress} disabled={savingAddress}>{savingAddress ? t("processing", "Đang xử lý...") : t("save_address", "Lưu địa chỉ")}</Button>
        </DialogActions>
      </Dialog>
    </AccountLayout>
  );
};

export default Profile;
