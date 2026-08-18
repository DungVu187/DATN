import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../context/languagecontext.jsx";
import { getStorefrontPolicies } from "../api/storefrontCatalogApi";
import "./styles/policy.css";

const policyMeta = {
  purchase: { icon: "fa-bag-shopping", shortTitleKey: "policy_purchase_short" },
  warranty: { icon: "fa-shield-halved", shortTitleKey: "policy_warranty_short" },
  shipping: { icon: "fa-truck-fast", shortTitleKey: "policy_shipping_short" },
  privacy: { icon: "fa-lock", shortTitleKey: "policy_privacy_short" },
};

const sectionIcons = [
  "fa-circle-check",
  "fa-list-check",
  "fa-box-open",
  "fa-clipboard-check",
  "fa-triangle-exclamation",
  "fa-headset",
];

const formatUpdatedDate = (value, locale, updatingText) => {
  if (!value) return updatingText;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return updatingText;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const getLocalizedPolicy = (policy, language) => {
  if (!policy) return policy;
  const content = policy.translations?.[language]
    || policy.translations?.vi
    || policy;
  return { ...policy, ...content };
};

const Policy = () => {
  const { t, language, locale } = useLanguage();
  const { policyKey = "purchase" } = useParams();
  const [policies, setPolicies] = useState([]);
  const [openSections, setOpenSections] = useState({ 0: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        const response = await getStorefrontPolicies();
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) {
          throw new Error("policy_fetch_failed");
        }
        setPolicies(result.data);
      } catch (fetchError) {
        console.error("Error fetching policies:", fetchError);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPolicies();
  }, []);

  useEffect(() => {
    setOpenSections({ 0: true });
  }, [policyKey]);

  const activePolicy = useMemo(() => {
    const policy = policies.find((item) => item.key === policyKey)
      || policies.find((item) => item.key === "purchase")
      || policies[0];
    return getLocalizedPolicy(policy, language);
  }, [language, policies, policyKey]);

  const toggleSection = (index) => {
    setOpenSections((current) => ({ ...current, [index]: !current[index] }));
  };

  return (
    <main className="policy-page">
      <div className="policy-shell">
        <nav className="policy-breadcrumb" aria-label={t("breadcrumb")}>
          <Link to="/">{t("home")}</Link>
          <i className="fa-solid fa-angle-right" />
          <span>{t("policies")}</span>
        </nav>

        <header className="policy-page-heading">
          <span className="policy-page-kicker">{t("customer_information")}</span>
          <h1>{t("policies")}</h1>
          <p>{t("policy_page_description")}</p>
        </header>

        {loading && (
          <div className="policy-status" role="status">
            <span className="policy-spinner" />
            <p>{t("loading_policy_content")}</p>
          </div>
        )}

        {!loading && error && (
          <div className="policy-status policy-status-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" />
            <p>{t("policy_load_error")}</p>
          </div>
        )}

        {!loading && !error && activePolicy && (
          <div className="policy-layout">
            <aside className="policy-sidebar">
              <div className="policy-navigation-card">
                <h2>{t("policy_categories")}</h2>
                <div className="policy-navigation-list">
                  {policies.map((policy) => {
                    const localizedPolicy = getLocalizedPolicy(policy, language);
                    const meta = policyMeta[policy.key] || policyMeta.purchase;
                    const isActive = activePolicy.key === policy.key;
                    return (
                      <Link
                        key={policy.key}
                        to={`/policy/${policy.key}`}
                        className={isActive ? "is-active" : ""}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span><i className={`fa-solid ${meta.icon}`} /></span>
                        <strong>{localizedPolicy.title}</strong>
                        <i className="fa-solid fa-angle-right" />
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="policy-support-card">
                <span><i className="fa-solid fa-headset" /></span>
                <div>
                  <strong>{t("need_help")}</strong>
                  <p>{t("support_team_ready")}</p>
                  <a href="tel:0901513825"><i className="fa-solid fa-phone" /> 09.0151.3825</a>
                </div>
              </div>
            </aside>

            <section className="policy-content-card">
              <header className="policy-content-heading">
                <div className="policy-content-title">
                  <span><i className={`fa-solid ${policyMeta[activePolicy.key]?.icon || "fa-shield-halved"}`} /></span>
                  <div>
                    <small>{t(policyMeta[activePolicy.key]?.shortTitleKey || "policy_purchase_short")}</small>
                    <h2>{activePolicy.title}</h2>
                    <p>{activePolicy.summary}</p>
                  </div>
                </div>
                <div className="policy-updated">
                  <i className="fa-regular fa-calendar" />
                  <span>{t("last_updated")} <strong>{formatUpdatedDate(activePolicy.updatedAt, locale, t("updating_status"))}</strong></span>
                </div>
              </header>

              <div className="policy-accordion">
                {activePolicy.sections.map((section, index) => {
                  const isOpen = Boolean(openSections[index]);
                  return (
                    <article className={`policy-accordion-item${isOpen ? " is-open" : ""}`} key={`${activePolicy.key}-${index}`}>
                      <button
                        type="button"
                        onClick={() => toggleSection(index)}
                        aria-expanded={isOpen}
                      >
                        <span className="policy-section-icon">
                          <i className={`fa-solid ${sectionIcons[index % sectionIcons.length]}`} />
                        </span>
                        <span className="policy-section-copy">
                          <strong>{section.title}</strong>
                          {!isOpen && <small>{section.content}</small>}
                        </span>
                        <span className="policy-section-toggle">
                          <i className={`fa-solid ${isOpen ? "fa-minus" : "fa-plus"}`} />
                        </span>
                      </button>
                      {isOpen && <div className="policy-accordion-content">{section.content}</div>}
                    </article>
                  );
                })}
              </div>

              <div className="policy-contact-strip">
                <span><i className="fa-solid fa-circle-info" /></span>
                <p>{t("policy_contact_prompt")}</p>
                <a href="mailto:dungvutb1807@gmail.com">
                  <i className="fa-regular fa-comment-dots" /> {t("contact_now")}
                </a>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
};

export default Policy;
