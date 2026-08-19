import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AccountCircleOutlined,
  LockResetOutlined,
  LogoutOutlined,
  PersonOutlineRounded,
  ReceiptLongOutlined,
  SupportAgentOutlined,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { apiFetch } from "../../api/httpClient";
import { text } from "../../constants/customerText.js";
import "./accountlayout.css";

const AccountLayout = ({ title, description, children }) => {
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const menuItems = [
    { to: "/profile", label: text("personal_info", "Thông tin cá nhân"), icon: PersonOutlineRounded, isActive: location.pathname === "/profile" },
    { to: "/myorder", label: text("my_orders", "Đơn hàng của tôi"), icon: ReceiptLongOutlined, isActive: location.pathname === "/myorder" },
    { to: "/change-password", label: text("change_password", "Đổi mật khẩu"), icon: LockResetOutlined, isActive: location.pathname === "/change-password" },
  ].filter(Boolean);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await apiFetch("/users/logout", { method: "POST" });
      if (!response.ok) throw new Error(text("logout_failed"));
      toast.success(text("logout_success", "Đăng xuất thành công"));
      window.location.href = "/login";
    } catch {
      toast.error(text("logout_failed"));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="account-layout-page">
      <div className="account-layout-shell">
        <header className="account-page-header">
          <div className="account-breadcrumb">
            <Link to="/">{text("home", "Trang chủ")}</Link>
            <span>/</span>
            <span>{text("account", "Tài khoản")}</span>
          </div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        <aside className="account-sidebar" aria-label={text("account", "Tài khoản")}>
          <div className="account-sidebar-heading">
            <span className="account-sidebar-heading-icon"><AccountCircleOutlined /></span>
            <span>{text("my_account", "Tài khoản của tôi")}</span>
          </div>
          <nav className="account-sidebar-menu">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} className={"account-sidebar-link" + (item.isActive ? " is-active" : "")} aria-current={item.isActive ? "page" : undefined}>
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button type="button" className="account-sidebar-link account-logout-button" onClick={handleLogout} disabled={loggingOut}>
              <LogoutOutlined />
              <span>{loggingOut ? text("logging_out", "Đang đăng xuất...") : text("logout", "Đăng xuất")}</span>
            </button>
          </nav>
          <div className="account-support-card">
            <SupportAgentOutlined />
            <div>
              <span>{text("customer_support_247", "Hỗ trợ khách hàng 24/7")}</span>
              <strong>09.0151.3825</strong>
            </div>
          </div>
        </aside>
        <main className="account-layout-main">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AccountLayout;
