import React, { useMemo, useState } from "react";
import {
  Button,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";
import {
  InfoOutlined,
  LockOutlined,
  LockResetRounded,
  ShieldOutlined,
  VerifiedUserOutlined,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { apiFetch, getAuthFailure } from "../api/httpClient";
import { text } from "../constants/customerText.js";
import AccountLayout from "../layout/accountlayout/accountlayout.jsx";
import "./styles/changepassword.css";

const ChangePassword = () => {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordScore = useMemo(() => {
    if (!newPassword) return 0;
    return [
      newPassword.length >= 6,
      newPassword.length >= 10,
      /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword),
      /\d/.test(newPassword),
      /[^A-Za-z0-9]/.test(newPassword),
    ].filter(Boolean).length;
  }, [newPassword]);

  const strength = useMemo(() => {
    if (passwordScore <= 2) return { label: text("password_strength_weak", "Yếu"), tone: "weak" };
    if (passwordScore === 3) return { label: text("password_strength_medium", "Trung bình"), tone: "medium" };
    if (passwordScore === 4) return { label: text("password_strength_good", "Tốt"), tone: "good" };
    return { label: text("password_strength_strong", "Mạnh"), tone: "strong" };
  }, [passwordScore]);

  const passwordsMismatch = confirmPassword !== "" && newPassword !== confirmPassword;
  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(text("fill_all_fields", "Vui lòng nhập đầy đủ thông tin"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(text("password_minimum_length", "Mật khẩu phải có ít nhất 6 ký tự"));
      return;
    }
    if (passwordsMismatch) {
      toast.error(text("passwords_do_not_match", "Mật khẩu mới không trùng khớp!"));
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch("/users/change-password", {
        method: "PUT",
        json: { currentPassword, newPassword },
      });
      if (!response.ok) {
        if (getAuthFailure(response) === "unauthorized") {
          toast.error(text("session_expired", "Phiên đăng nhập đã hết hạn"));
          navigate("/login?redirect=" + encodeURIComponent("/change-password"));
          return;
        }
        throw new Error(text("change_password_failed"));
      }

      toast.success(text("change_password_success", "Đổi mật khẩu thành công"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      try {
        await apiFetch("/users/logout", { method: "POST" });
      } catch (logoutError) {
        console.error("Không thể xóa phiên sau khi đổi mật khẩu:", logoutError);
      }
      window.setTimeout(() => navigate("/login"), 1200);
    } catch {
      toast.error(text("change_password_failed"));
    } finally {
      setLoading(false);
    }
  };

  const visibilityButton = (visible, toggle, label) => (
    <InputAdornment position="end">
      <IconButton aria-label={label} onClick={toggle} edge="end">
        {visible ? <VisibilityOff /> : <Visibility />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <AccountLayout
      title={text("change_password", "Đổi mật khẩu")}
      description={text("change_password_description", "Vui lòng tạo mật khẩu mới để bảo vệ tài khoản của bạn.")}
    >
      <section className="change-password-panel">
        <form className="change-password-form" onSubmit={handleChangePassword}>
          <div className="change-password-field-row">
            <span className="change-password-field-icon"><LockOutlined /></span>
            <div className="change-password-field-content">
              <label htmlFor="current-password">{text("current_password", "Mật khẩu hiện tại")}</label>
              <TextField
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                placeholder={text("current_password_placeholder", "Nhập mật khẩu hiện tại")}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                fullWidth
                autoComplete="current-password"
                InputProps={{ endAdornment: visibilityButton(showCurrentPassword, () => setShowCurrentPassword((visible) => !visible), text("toggle_password_visibility", "Hiện hoặc ẩn mật khẩu")) }}
              />
            </div>
          </div>

          <div className="change-password-field-row">
            <span className="change-password-field-icon"><LockResetRounded /></span>
            <div className="change-password-field-content">
              <label htmlFor="new-password">{text("new_password", "Mật khẩu mới")}</label>
              <TextField
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                placeholder={text("new_password_placeholder", "Nhập mật khẩu mới")}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                fullWidth
                autoComplete="new-password"
                InputProps={{ endAdornment: visibilityButton(showNewPassword, () => setShowNewPassword((visible) => !visible), text("toggle_password_visibility", "Hiện hoặc ẩn mật khẩu")) }}
              />
              <div className={"password-strength is-" + strength.tone}>
                <div className="password-strength-heading">
                  <span>{text("password_strength", "Độ mạnh mật khẩu")}:</span>
                  <strong>{newPassword ? strength.label : "—"}</strong>
                </div>
                <div className="password-strength-bars" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((bar) => <span className={bar <= passwordScore ? "is-filled" : ""} key={bar} />)}
                </div>
              </div>
              <p className="password-rule-note"><InfoOutlined />{text("password_rule_note", "Mật khẩu phải có ít nhất 6 ký tự; nên kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt.")}</p>
            </div>
          </div>

          <div className="change-password-field-row">
            <span className="change-password-field-icon"><ShieldOutlined /></span>
            <div className="change-password-field-content">
              <label htmlFor="confirm-password">{text("confirm_new_password", "Xác nhận mật khẩu mới")}</label>
              <TextField
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder={text("confirm_password_placeholder", "Nhập lại mật khẩu mới")}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                fullWidth
                autoComplete="new-password"
                error={passwordsMismatch}
                helperText={passwordsMismatch ? text("passwords_do_not_match", "Mật khẩu mới không trùng khớp") : ""}
                InputProps={{ endAdornment: visibilityButton(showConfirmPassword, () => setShowConfirmPassword((visible) => !visible), text("toggle_password_visibility", "Hiện hoặc ẩn mật khẩu")) }}
              />
            </div>
          </div>

          <Button className="change-password-submit" type="submit" variant="contained" disabled={loading} startIcon={<LockOutlined />}>
            {loading ? text("processing", "Đang xử lý...") : text("change_password", "Đổi mật khẩu")}
          </Button>
        </form>
      </section>

      <div className="change-password-security-note">
        <span />
        <VerifiedUserOutlined />
        <p>{text("encrypted_security_note", "Thông tin của bạn được mã hóa và bảo mật tuyệt đối.")}</p>
        <span />
      </div>
    </AccountLayout>
  );
};

export default ChangePassword;
