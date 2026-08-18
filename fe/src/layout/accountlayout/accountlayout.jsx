import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AccountCircleOutlined,
  LocationOnOutlined,
  LockResetOutlined,
  LogoutOutlined,
  PersonOutlineRounded,
  ReceiptLongOutlined,
  SupportAgentOutlined,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { apiFetch } from "../../api/httpClient";
import { useLanguage } from "../../context/languagecontext.jsx";
import "./accountlayout.css";

const AccountLayout = ({ title, description, children }) => {
  const { t } = useLanguage();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const profileSection = new URLSearchParams(location.search).get("section");
  const menuItems = [
    { to: "/profile", label: t("personal_info", "Thông tin cá nhân"), icon: PersonOutlineRounded, isActive: location.pathname === "/profile" && profileSection !== "addresses" },
    { to: "/profile?section=addresses", label: t("my_addresses", "Địa chỉ của tôi"), icon: LocationOnOutlined, isActive: location.pathname === "/profile" && profileSection === "addresses" },
    { to: "/myorder", label: t("my_orders", "Đơn hàng của tôi"), icon: ReceiptLongOutlined, isActive: location.pathname === "/myorder" },
    { to: "/change-password", label: t("change_password", "Đổi mật khẩu"), icon: LockResetOutlined, isActive: location.pathname === "/change-password" },
  ].filter(Boolean);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await apiFetch("/users/logout", { method: "POST" });
      if (!response.ok) throw new Error(t("logout_failed"));
      toast.success(t("logout_success", "Đăng xuất thành công"));
      window.location.href = "/login";
    } catch {
      toast.error(t("logout_failed"));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="account-layout-page">
      <div className="account-layout-shell">
        <header className="account-page-header">
          <div className="account-breadcrumb">
            <Link to="/dashboard">{t("home", "Trang chủ")}</Link>
            <span>/</span>
            <span>{t("account", "Tài khoản")}</span>
          </div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        <aside className="account-sidebar" aria-label={t("account", "Tài khoản")}>
          <div className="account-sidebar-heading">
            <span className="account-sidebar-heading-icon"><AccountCircleOutlined /></span>
            <span>{t("my_account", "Tài khoản của tôi")}</span>
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
              <span>{loggingOut ? t("logging_out", "Đang đăng xuất...") : t("logout", "Đăng xuất")}</span>
            </button>
          </nav>
          <div className="account-support-card">
            <SupportAgentOutlined />
            <div>
              <span>{t("customer_support_247", "Hỗ trợ khách hàng 24/7")}</span>
              <strong>08.1315.8383</strong>
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
