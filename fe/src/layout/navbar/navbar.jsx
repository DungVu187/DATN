import React, { useContext, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import logo from "../../assets/nova-logo-light.svg";
import { apiFetch } from "../../api/httpClient";
import { ShopContext } from "../../context/shopcontext";
import { useLanguage } from "../../context/languagecontext.jsx";
import "./navbar.css";

function Navbar() {
  const { language, setLanguage, t } = useLanguage();
  const { getCartItemCount } = useContext(ShopContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiFetch("/users/profile", {
          method: "GET",
        });
        if (response.ok) {
          const data = await response.json();
          setIsLoggedIn(true);
          setUserName(data.name || data.phone || "");
        } else {
          setIsLoggedIn(false);
          setUserName("");
        }
      } catch (error) {
        setIsLoggedIn(false);
        setUserName("");
        console.error("Error checking auth:", error);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch(location.pathname === "/product" ? params.get("search") || "" : "");
  }, [location.pathname, location.search]);

  const closeMenu = () => setIsMenuOpen(false);

  const handleSearch = (event) => {
    event.preventDefault();
    const term = search.trim();
    navigate(term ? `/product?search=${encodeURIComponent(term)}` : "/product");
  };

  const handleLogout = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const response = await apiFetch("/users/logout", {
        method: "POST",
      });
      if (response.ok) {
        setIsLoggedIn(false);
        setUserName("");
        toast.success(t("logout_success"));
        window.location.href = "/login";
      } else {
        toast.error(t("logout_failed"));
      }
    } catch (error) {
      toast.error(t("generic_error_retry"));
    } finally {
      setIsLoading(false);
    }
  };

  const loginPath = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  const cartItemCount = getCartItemCount();

  return (
    <header className="store-header">
      <div className="store-main-nav">
        <div className="store-header-shell store-main-nav-content">
          <button className="store-menu-button" type="button" onClick={() => setIsMenuOpen(true)} aria-label={t("open_categories")}><i className="fa-solid fa-bars" /></button>
          <Link className="store-logo" to="/"><img src={logo} alt="Nova" /></Link>

          <form className="store-search" onSubmit={handleSearch}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search_placeholder")} aria-label={t("search_products")} />
            <button type="submit" aria-label={t("search")}><i className="fa-solid fa-magnifying-glass" /></button>
          </form>

          <nav className="store-nav-actions" aria-label={t("customer_utilities")}>
            <Link className="store-mobile-account-link" to={isLoggedIn ? "/profile" : loginPath} aria-label={t("account")}>
              <i className="fa-regular fa-user" />
            </Link>
            <div className="store-nav-popover store-account-popover">
              <button type="button"><i className="fa-regular fa-user" /><span>{isLoggedIn ? userName || t("account_fallback") : t("account")}</span></button>
              <div className="store-popover-menu">
                {isLoggedIn ? (
                  <>
                    <Link to="/profile">{t("personal_info")}</Link>
                    <Link to="/myorder">{t("my_orders")}</Link>
                    <Link to="/change-password">{t("change_password")}</Link>
                    <button type="button" onClick={handleLogout} disabled={isLoading}>{isLoading ? t("logging_out") : t("logout")}</button>
                  </>
                ) : (
                  <><Link to={loginPath}>{t("login")}</Link><Link to="/myorder">{t("my_orders")}</Link></>
                )}
              </div>
            </div>
            <div className="store-nav-popover store-language-menu">
              <button type="button"><i className="fa-solid fa-globe" /><span>{language === "vi" ? t("vietnamese") : language === "zh" ? t("chinese") : t("english")}</span><i className="fa-solid fa-angle-down store-action-chevron" /></button>
              <div className="store-popover-menu">
                <button type="button" onClick={() => setLanguage("vi")}>{t("vietnamese")}</button>
                <button type="button" onClick={() => setLanguage("zh")}>{t("chinese")}</button>
                <button type="button" onClick={() => setLanguage("en")}>{t("english")}</button>
              </div>
            </div>
            <Link className="store-cart-link" to="/cart"><span className="store-cart-icon"><i className="fa-solid fa-cart-shopping" /><b className={cartItemCount === 0 ? "is-empty" : ""}>{cartItemCount}</b></span><span>{t("cart")}</span></Link>
          </nav>
        </div>

        <form className="store-mobile-search" onSubmit={handleSearch}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search_placeholder")} aria-label={t("search_products")} />
          <button type="submit" aria-label={t("search")}><i className="fa-solid fa-magnifying-glass" /></button>
        </form>
      </div>

      <div className={`store-drawer-overlay ${isMenuOpen ? "is-open" : ""}`} onClick={closeMenu} />
      <aside className={`store-category-drawer ${isMenuOpen ? "is-open" : ""}`}>
        <div className="store-drawer-heading"><div><img src={logo} alt="Nova" /><span>{t("categories")}</span></div><button type="button" onClick={closeMenu}><i className="fa-solid fa-xmark" /></button></div>
        <div className="store-drawer-links">
          <Link to="/" onClick={closeMenu}><i className="fa-solid fa-house" /><span>{t("home")}</span><i className="fa-solid fa-angle-right" /></Link>
          <Link to="/product" onClick={closeMenu}><i className="fa-solid fa-border-all" /><span>{t("products")}</span><i className="fa-solid fa-angle-right" /></Link>
          <Link to="/dashboard" onClick={closeMenu}><i className="fa-solid fa-layer-group" /><span>{t("equipment_group")}</span><i className="fa-solid fa-angle-right" /></Link>
          <Link to="/myorder" onClick={closeMenu}><i className="fa-solid fa-receipt" /><span>{t("my_orders")}</span><i className="fa-solid fa-angle-right" /></Link>
          {isLoggedIn ? (
            <button className="store-drawer-action" type="button" onClick={handleLogout} disabled={isLoading}>
              <i className="fa-solid fa-right-from-bracket" /><span>{isLoading ? t("logging_out") : t("logout")}</span>
            </button>
          ) : (
            <Link to={loginPath} onClick={closeMenu}><i className="fa-solid fa-right-to-bracket" /><span>{t("login")}</span><i className="fa-solid fa-angle-right" /></Link>
          )}

          <div className="store-drawer-language">
            <strong>{t("language_label")}</strong>
            <div>
              <button type="button" className={language === "vi" ? "is-active" : ""} onClick={() => { setLanguage("vi"); closeMenu(); }}>VI</button>
              <button type="button" className={language === "zh" ? "is-active" : ""} onClick={() => { setLanguage("zh"); closeMenu(); }}>ZH</button>
              <button type="button" className={language === "en" ? "is-active" : ""} onClick={() => { setLanguage("en"); closeMenu(); }}>EN</button>
            </div>
          </div>
        </div>
        <div className="store-drawer-footer"><a href="tel:0901513825"><i className="fa-solid fa-headset" /> {t("hotline_label")}: 09.0151.3825</a></div>
      </aside>
    </header>
  );
}

export default Navbar;
