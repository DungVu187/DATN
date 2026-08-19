import React, { useState } from "react";
import "./styles/login.css";
import { toast } from "react-hot-toast";
import {
  loginCustomer,
  registerCustomer,
  requestCustomerPasswordReset,
  resetCustomerPassword,
} from "../api/customerAccountApi";
import { text } from "../constants/customerText.js";

function LogIn() {
  const [isSignUpActive, setIsSignUpActive] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");

  // Quên mật khẩu state
  const [isForgotPasswordActive, setIsForgotPasswordActive] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1); // 1 = nhập SĐT/Email, 2 = nhập OTP & đặt lại mật khẩu mới
  const [forgotIdentifier, setForgotIdentifier] = useState(""); // SĐT hoặc Email
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Nhập liệu đăng nhập: có thể là SĐT hoặc Email
  const [loginIdentifier, setLoginIdentifier] = useState("");

  // Hàm kiểm tra định dạng số điện thoại (10 chữ số)
  const validatePhone = (phone) => {
    const re = /^\d{10}$/;
    return re.test(phone);
  };

  const handleToggle = () => {
    setIsSignUpActive((prev) => !prev);
    setIsForgotPasswordActive(false);
    setForgotPasswordStep(1);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error(text("passwords_do_not_match_signup", "Mật khẩu không khớp"));
      return;
    }
    if (!validatePhone(phone)) {
      toast.error(text("phone_validation_msg", "Số điện thoại phải có đúng 10 chữ số"));
      return;
    }
    if (!email) {
      toast.error(text("email_required_msg", "Vui lòng nhập email"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(text("email_validation_msg", "Email không đúng định dạng"));
      return;
    }

    const user = { name, email, phone, password };

    try {
      const response = await registerCustomer(user);

      if (response.ok) {
        toast.success(text("register_success", "Đăng ký thành công"));
        setName("");
        setEmail("");
        setPhone("");
        setPassword("");
        setConfirmPassword("");
        setIsSignUpActive(false);
      } else {
        toast.error(text("register_failed"));
      }
    } catch (error) {
      toast.error(text("error_occurred"));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginIdentifier) {
      toast.error(text("login_identifier_required", "Vui lòng nhập số điện thoại hoặc email"));
      return;
    }

    // Phát hiện xem đây là email hay SĐT
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginIdentifier);
    const isPhone = /^\d{10}$/.test(loginIdentifier);

    if (!isEmail && !isPhone) {
      toast.error(text("login_identifier_invalid", "Vui lòng nhập đúng số điện thoại (10 số) hoặc địa chỉ email"));
      return;
    }

    const user = isEmail
      ? { email: loginIdentifier, password }
      : { phone: loginIdentifier, password };

    try {
      const response = await loginCustomer(user);

      if (response.ok) {
        toast.success(text("login_success", "Đăng nhập thành công"));
        const queryParams = new URLSearchParams(window.location.search);
        const redirectUrl = queryParams.get("redirect") || "/";
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 1000);
      } else {
        toast.error(text("invalid_credentials", "Số điện thoại/Email hoặc mật khẩu không đúng"));
      }
    } catch (error) {
      toast.error(text("error_occurred"));
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!forgotIdentifier) {
      toast.error(text("forgot_identifier_required", "Vui lòng nhập số điện thoại hoặc email"));
      return;
    }

    setLoading(true);
    try {
      const response = await requestCustomerPasswordReset(forgotIdentifier);

      if (response.ok) {
        toast.success(text("otp_sent_success", "Mã OTP đã được gửi"));
        setForgotPasswordStep(2);
      } else {
        toast.error(text("otp_send_failed"));
      }
    } catch (error) {
      toast.error(text("error_occurred"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error(text("passwords_do_not_match_signup", "Mật khẩu không khớp"));
      return;
    }
    if (!otp || otp.length < 6) {
      toast.error(text("otp_invalid", "Vui lòng nhập mã OTP gồm 6 chữ số"));
      return;
    }

    setLoading(true);
    try {
      const response = await resetCustomerPassword({
        identifier: forgotIdentifier,
        otp,
        newPassword,
      });

      if (response.ok) {
        toast.success(text("reset_password_success", "Đặt lại mật khẩu thành công"));
        setIsForgotPasswordActive(false);
        setForgotPasswordStep(1);
        setForgotIdentifier("");
        setOtp("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        toast.error(text("reset_password_failed"));
      }
    } catch (error) {
      toast.error(text("error_occurred"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-main-container" style={{ minHeight: "100vh" }}>
      <div
        className={`login-container ${isSignUpActive ? "active" : ""}`}
        id="login-container"
      >
        <div className="form-container sign-up">
          <form onSubmit={handleRegister}>
            <h1>{text("create_account", "Tạo tài khoản")}</h1>
            <input
              type="text"
              placeholder={text("full_name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="tel"
              placeholder={text("phone_number")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              type="email"
              placeholder={text("email_address", "Địa chỉ email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder={text("password", "Mật khẩu")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder={text("confirm_password", "Xác nhận mật khẩu")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button type="submit">{text("register", "Đăng ký")}</button>
            <p className="mobile-toggle-text" onClick={handleToggle}>
              {text("already_have_account_login", "Đã có tài khoản? Đăng nhập ngay")}
            </p>
          </form>
        </div>

        <div className="form-container sign-in">
          {isForgotPasswordActive ? (
            forgotPasswordStep === 1 ? (
              <form onSubmit={handleRequestOtp}>
                <h1>{text("forgot_password_title", "Quên mật khẩu")}</h1>
                <p style={{ textAlign: "center", fontSize: "13px", color: "#666", marginBottom: "15px" }}>
                  {text("forgot_password_desc", "Nhập số điện thoại hoặc email của bạn để nhận mã OTP khôi phục mật khẩu.")}
                </p>
                <input
                  type="text"
                  placeholder={text("phone_or_email", "Số điện thoại hoặc Email")}
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  required
                />
                <p style={{ 
                  fontSize: "12px", 
                  color: "#d32f2f", 
                  marginTop: "-5px", 
                  marginBottom: "15px", 
                  textAlign: "left", 
                  width: "100%", 
                  fontStyle: "italic",
                  lineHeight: "1.4"
                }}>
                  {text("otp_email_note", "Lưu ý: Mã OTP sẽ gửi về email đăng ký của khách hàng. OTP có hiệu lực trong vòng 5 phút!")}
                </p>
                <button type="submit" disabled={loading}>
                  {loading ? text("processing") : text("send_otp", "Gửi mã OTP")}
                </button>
                <p
                  onClick={() => {
                    setIsForgotPasswordActive(false);
                    setForgotPasswordStep(1);
                  }}
                  style={{
                    marginTop: "15px",
                    fontSize: "13px",
                    color: "#0052ab",
                    cursor: "pointer",
                    fontWeight: "500",
                    textDecoration: "underline"
                  }}
                >
                  {text("back_to_login", "Quay lại đăng nhập")}
                </p>
              </form>
            ) : (
              <form onSubmit={handleResetPassword}>
                <h1>{text("reset_password_title", "Đặt lại mật khẩu")}</h1>
                <p style={{ textAlign: "center", fontSize: "13px", color: "#666", marginBottom: "15px" }}>
                  {text("otp_sent_to", "Mã OTP đã được gửi đến email liên kết của tài khoản:")} <strong>{forgotIdentifier}</strong>
                </p>
                <input
                  type="text"
                  placeholder={text("otp_placeholder", "Nhập mã OTP 6 số")}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  required
                />
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder={text("new_password", "Mật khẩu mới")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    style={{ paddingRight: "40px" }}
                  />
                  <span
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "55%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                      color: "#666",
                      fontSize: "16px",
                      zIndex: 10
                    }}
                  >
                    <i className={showNewPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"}></i>
                  </span>
                </div>
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type={showConfirmNewPassword ? "text" : "password"}
                    placeholder={text("confirm_new_password", "Nhập lại mật khẩu mới")}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    style={{ paddingRight: "40px" }}
                  />
                  <span
                    onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "55%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                      color: "#666",
                      fontSize: "16px",
                      zIndex: 10
                    }}
                  >
                    <i className={showConfirmNewPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"}></i>
                  </span>
                </div>
                <button type="submit" disabled={loading}>
                  {loading ? text("processing") : text("confirm_reset", "Xác nhận")}
                </button>
                <p
                  onClick={() => setForgotPasswordStep(1)}
                  style={{
                    marginTop: "15px",
                    fontSize: "13px",
                    color: "#0052ab",
                    cursor: "pointer",
                    fontWeight: "500",
                    textDecoration: "underline"
                  }}
                >
                  {text("back", "Quay lại")}
                </p>
              </form>
            )
          ) : (
            <form onSubmit={handleLogin}>
              <h1>{text("login")}</h1>
              <input
                type="text"
                placeholder={text("phone_or_email", "Số điện thoại hoặc Email")}
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
              />
              <input
                type="password"
                placeholder={text("password", "Mật khẩu")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p
                onClick={() => {
                  setIsForgotPasswordActive(true);
                  setForgotPasswordStep(1);
                  setForgotIdentifier(loginIdentifier); // auto fill nếu họ đã nhập
                }}
                style={{
                  alignSelf: "flex-end",
                  margin: "5px 0 15px",
                  fontSize: "13px",
                  color: "#0052ab",
                  cursor: "pointer",
                  fontWeight: "500",
                  textDecoration: "underline"
                }}
              >
                {text("forgot_password", "Quên mật khẩu?")}
              </p>
              <button type="submit">{text("login")}</button>
              <p className="mobile-toggle-text" onClick={handleToggle}>
                {text("dont_have_account_register", "Chưa có tài khoản? Đăng ký ngay")}
              </p>
            </form>
          )}
        </div>

        <div className="login-toggle-container">
          <div className="login-toggle">
            <div className="login-toggle-panel login-toggle-left">
              <h1>{text("welcome", "Chào mừng!")}</h1>
              <p>{text("fill_to_register", "Hãy điền thông tin để tạo tài khoản")}</p>
              <button onClick={handleToggle} className="hidden" id="login">
                {text("login")}
              </button>
            </div>
            <div className="login-toggle-panel login-toggle-right">
              <h1>{text("hello", "Xin chào!")}</h1>
              <p>{text("login_to_use_all_features", "Hãy đăng nhập để sử dụng hết các tính năng")}</p>
              <button onClick={handleToggle} className="hidden" id="register">
                {text("register", "Đăng ký")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogIn;
