import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/languagecontext";
import "./styles/catalog.css";
import {
  getStorefrontSectionDocument,
  resolveStorefrontAssetUrl,
} from "../api/storefrontCatalogApi";

const getSectionIcon = (sectionName) => {
  const name = String(sectionName || "").toLowerCase().trim();
  if (name.includes("trung tâm")) return "fa-solid fa-house";
  if (name.includes("băng")) return "fa-solid fa-layer-group";
  if (name.includes("cối")) return "fa-solid fa-boxes-stacked";
  if (name.includes("cốt liệu")) return "fa-solid fa-warehouse";
  if (name.includes("silo")) return "fa-solid fa-building-columns";
  if (name.includes("tủ điện") || name.includes("tủ điều khiển") || name.includes("cabinet")) return "fa-solid fa-microchip";
  if (name.includes("mixer")) return "fa-solid fa-boxes-stacked";
  if (name.includes("bơm") || name.includes("pump")) return "fa-solid fa-faucet-drip";
  if (name.includes("cân") || name.includes("scale") || name.includes("loadcell")) return "fa-solid fa-scale-balanced";
  if (name.includes("lọc") || name.includes("filter")) return "fa-solid fa-filter";
  if (name.includes("khí") || name.includes("nén") || name.includes("air")) return "fa-solid fa-wind";
  if (name.includes("động cơ") || name.includes("motor")) return "fa-solid fa-bolt";
  if (name.includes("van") || name.includes("valve")) return "fa-solid fa-circle-notch";
  return "fa-solid fa-industry";
};

const getSectionDisplayName = (sectionName) => {
  const normalizedName = String(sectionName || "").trim().toLowerCase();
  if (normalizedName === "trạm trộn bê tông") return "Hệ Thống Tự Động Hóa";
  return sectionName;
};

const MainPage = () => {
  const { t } = useLanguage();
  const [sections, setSections] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getStorefrontSectionDocument()
      .then((res) => res.json())
      .then((data) => {
        const fullSections = data.Section || [];
        const filtered = fullSections.filter((sec) => sec.imgUrl);
        const sorted = filtered.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true })
        );
        setSections(sorted);
      })
      .catch((error) => {
        console.error("Lỗi khi fetch section-doc:", error);
      });
  }, []);

  const handleClick = (sectionName) => {
    navigate(`/section/${sectionName}`);
  };

  return (
    <div className="catalog-container">
      <div className="catalog-bg-dots-left" />
      <div className="catalog-bg-dots-right" />

      <section className="catalog-content-shell">
        <div className="catalog-grid">
          {sections.map((section, index) => {
            const hasPhoto = !!section.imgUrl;
            const iconClass = getSectionIcon(section.name);
            const displayName = getSectionDisplayName(section.name);

            return (
              <div
                key={index}
                className={`catalog-card ${hasPhoto ? "has-photo" : "no-photo"}`}
                onClick={() => handleClick(section.name)}
              >
                <div className="catalog-card-left">
                  <div className="catalog-card-icon-badge">
                    <i className={iconClass} />
                  </div>

                  <h2 className="catalog-card-title">{displayName}</h2>
                </div>

                {hasPhoto && (
                  <div className="catalog-card-right-img">
                    <img src={resolveStorefrontAssetUrl(section.imgUrl)} alt={displayName} />
                    <div className="catalog-card-img-gradient" />
                  </div>
                )}


                <button className="catalog-card-btn" type="button" aria-label={t("view_details")}>
                  <i className="fa-solid fa-arrow-right" />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default MainPage;
