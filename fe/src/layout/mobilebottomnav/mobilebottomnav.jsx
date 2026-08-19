import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { text } from "../../constants/customerText.js";
import "./mobilebottomnav.css";

const getNavClass = ({ isActive }) => `mobile-bottom-nav-item${isActive ? " is-active" : ""}`;

function MobileBottomNav() {
  const { pathname } = useLocation();
  const isProductDetail = /^\/product\/[^/]+$/.test(pathname);
  const isHidden = isProductDetail || pathname === "/cart" || pathname === "/login";

  if (isHidden) return null;

  return (
    <nav className="mobile-bottom-nav" aria-label={text("mobile_navigation")}>
      <NavLink className={getNavClass} to="/" end>
        <i className="fa-solid fa-house" />
        <span>{text("home")}</span>
      </NavLink>
      <NavLink className={getNavClass} to="/product">
        <i className="fa-solid fa-border-all" />
        <span>{text("categories")}</span>
      </NavLink>
      <NavLink className={getNavClass} to="/profile">
        <i className="fa-regular fa-user" />
        <span>{text("account")}</span>
      </NavLink>
      <a className="mobile-bottom-nav-item" href="tel:0901513825">
        <i className="fa-solid fa-headset" />
        <span>{text("support")}</span>
      </a>
    </nav>
  );
}

export default MobileBottomNav;
