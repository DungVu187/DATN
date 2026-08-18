import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/nova-logo-dark.svg";
import { useLanguage } from "../../context/languagecontext.jsx";
import {
  getStorefrontContent,
  resolveStorefrontAssetUrl,
} from "../../api/storefrontCatalogApi";
import "./footer.css";

const DEFAULT_CONTACT = {
  logo: "",
  description: "",
  address: "Số 25 ngõ 77, Bùi Xương Trạch, Thanh Xuân, Hà Nội",
  phone: "0901513825",
  email: "dungvutb1807@gmail.com",
};

function Footer() {
  const { t } = useLanguage();
  const [footerContent, setFooterContent] = useState(DEFAULT_CONTACT);

  useEffect(() => {
    let active = true;

    getStorefrontContent({ cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (!active || !result?.success) return;
        setFooterContent({
          ...DEFAULT_CONTACT,
          ...(result.data?.footerContent || {}),
        });
      })
      .catch((error) => {
        console.error("Không thể tải nội dung footer:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const hasCustomLogo = Boolean(footerContent.logo);
  const footerLogo = hasCustomLogo ? resolveStorefrontAssetUrl(footerContent.logo) : logo;
  const description = footerContent.description || t("footer_brand_desc");
  const address = footerContent.address || t("footer_address");
  const phone = footerContent.phone || DEFAULT_CONTACT.phone;
  const email = footerContent.email || DEFAULT_CONTACT.email;
  const phoneHref = phone.replace(/[^\d+]/g, "");

  return (
    <footer className="store-footer">
      <div className="store-footer-shell">
        <div className="store-footer-grid">
          <section className="store-footer-brand">
            <div className={"store-footer-logo" + (hasCustomLogo ? " is-custom" : "")}><img src={footerLogo} alt="Nova" /></div>
            <p>{description}</p>
            <ul className="store-footer-contact">
              <li><i className="fa-solid fa-location-dot" /><span>{address}</span></li>
              <li><i className="fa-solid fa-phone" /><a href={`tel:${phoneHref}`}>{phone}</a></li>
              <li><i className="fa-solid fa-envelope" /><a href={`mailto:${email}`}>{email}</a></li>
            </ul>
            <div className="store-footer-socials">
              <a href={`tel:${phoneHref}`} aria-label={t("hotline_label")}><i className="fa-solid fa-phone" /></a>
              <a href={`mailto:${email}`} aria-label={t("send_email")}><i className="fa-solid fa-envelope" /></a>
            </div>
          </section>

          <section className="store-footer-column">
            <h3>{t("quick_links")}</h3>
            <Link to="/" onClick={scrollToTop}>{t("home")}</Link>
            <Link to="/product" onClick={scrollToTop}>{t("products")}</Link>
            <Link to="/dashboard" onClick={scrollToTop}>{t("equipment_group")}</Link>
            <Link to="/introduction" onClick={scrollToTop}>{t("introduction")}</Link>
          </section>

          <section className="store-footer-column">
            <h3>{t("policies")}</h3>
            <Link to="/policy/purchase" onClick={scrollToTop}>{t("purchase_policy")}</Link>
            <Link to="/policy/warranty" onClick={scrollToTop}>{t("return_warranty")}</Link>
            <Link to="/policy/shipping" onClick={scrollToTop}>{t("shipping_policy")}</Link>
            <Link to="/policy/privacy" onClick={scrollToTop}>{t("privacy_policy")}</Link>
          </section>

          <section className="store-footer-column">
            <h3>{t("support")}</h3>
            <Link to="/policy/purchase" onClick={scrollToTop}>{t("shopping_guide")}</Link>
            <Link to="/policy/warranty" onClick={scrollToTop}>{t("warranty_request")}</Link>
            <a href={`mailto:${email}`}>{t("send_support_request")}</a>
            <a href={`tel:${phoneHref}`}>{t("technical_support_247")}</a>
          </section>

        </div>

        <div className="store-footer-bottom">
          <span>{t("copyright")}</span>
          <button type="button" onClick={scrollToTop} aria-label={t("back_to_top")}><i className="fa-solid fa-angle-up" /></button>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
