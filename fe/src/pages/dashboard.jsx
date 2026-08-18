import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "./styles/dashboard.css";
import novaIndustrialHero from "../assets/nova-industrial-hero.svg";
import { ShopContext } from "../context/shopcontext";
import HomeCategoryIcon from "../components/homecategoryicon";
import SafeProductImage from "../components/safeproductimage";
import { getCategoryIcon, normalizeTypeName } from "../utils/homecategoryicons";
import { formatVariantPrice, isContactOnlyVariant } from "../utils/productpricing";
import { useLanguage } from "../context/languagecontext.jsx";
import { getLocalizedText } from "../utils/localizedcontent";
import {
  getStorefrontContent,
  getStorefrontProductsByIds,
  getStorefrontProductTypes,
  resolveStorefrontAssetUrl,
} from "../api/storefrontCatalogApi";

const getVersionedImageUrl = (url, version) => {
  if (!url) return "";
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version || "1")}`;
};

const isImageAsset = (value) => typeof value === "string" && (
  /^data:image\//i.test(value)
  || /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value)
);

const isLegacyHero = (value) => typeof value === "string" && (
  /manage_1785606081045\.jpg(?:[?#].*)?$/i.test(value)
  || /manage_1783154141653\.jpg(?:[?#].*)?$/i.test(value)
);

const buildAutomaticCategories = (types) =>
  types.slice(0, 9).map((type, index) => ({
    id: type._id || `automatic-category-${index}`,
    label: type.Type,
    type: type.Type,
    link: "",
    icon: type.icon || getCategoryIcon(type.Type),
    image: "",
    showSidebar: true,
    showQuick: index < 8,
  }));

const resolveCategoryLink = (category) => {
  const customLink = (category?.link || "").trim();
  if (customLink) return customLink;
  const type = (category?.type || "").trim();
  return type ? `/product?type=${encodeURIComponent(type)}` : "/product";
};

function HomeCategoryLink({ category, className, children }) {
  const href = resolveCategoryLink(category);
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return <Link className={className} to={href}>{children}</Link>;
}

const resolveSectionLink = (name, types) => {
  const cleanName = (name || "").trim().toLowerCase();
  if (!cleanName) return "/product";
  const matchedType = types.find((t) => (t.Type || "").trim().toLowerCase() === cleanName);
  if (matchedType) {
    return `/product?type=${encodeURIComponent(matchedType.Type)}`;
  }
  return "/product";
};

function SectionHeader({ title, href = "/product", showViewAll = true }) {
  const { t } = useLanguage();
  return (
    <div className="home-section-heading">
      <h2>{title}</h2>
      {showViewAll && (
        <Link to={href}>{t("view_all")} <i className="fa-solid fa-angle-right" /></Link>
      )}
    </div>
  );
}

function Dashboard() {
  const { t, language } = useLanguage();
  const location = useLocation();
  const { addToCart } = useContext(ShopContext);
  const [manageData, setManageData] = useState(null);
  const [products, setProducts] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadHomeData = async () => {
      setLoading(true);
      try {
        const [manageResponse, typeResponse] = await Promise.all([
          getStorefrontContent({ cache: "no-store" }),
          getStorefrontProductTypes({ cache: "no-store" }),
        ]);

        const manageResult = await manageResponse.json();
        const typeResult = await typeResponse.json();
        const nextManageData = manageResult?.success ? manageResult.data : null;

        if (!active) return;
        setManageData(nextManageData);
        setTypes(Array.isArray(typeResult) ? typeResult : typeResult?.value || []);
        const activeSections = Object.keys(nextManageData || {})
          .filter((key) => /^section(1[0-1]|[1-9])$/.test(key) && nextManageData[key]?.display);
        
        const productIds = Array.from(new Set(
          activeSections.flatMap((key) => nextManageData[key]?.productId || [])
        ));

        if (productIds.length > 0) {
          const productResponse = await getStorefrontProductsByIds(productIds);
          const productResult = await productResponse.json();
          if (active) setProducts(productResult?.success ? productResult.products || [] : []);
        } else if (active) {
          setProducts([]);
        }
      } catch (error) {
        console.error("Không thể tải dữ liệu trang chủ:", error);
        if (active) {
          setManageData(null);
          setProducts([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadHomeData();
    return () => { active = false; };
  }, [location.pathname]);

  const heroImages = useMemo(() => {
    const images = (manageData?.overViewImg || [])
      .map((image) => isLegacyHero(image) ? novaIndustrialHero : resolveStorefrontAssetUrl(image))
      .filter(Boolean)
      .reverse();
    return images.length > 0 ? images : [novaIndustrialHero];
  }, [manageData]);

  const homeCategories = useMemo(() => {
    const config = manageData?.homeCategoryConfig;
    if (config?.configured) {
      return (Array.isArray(config.items) ? config.items : [])
        .filter((item) => item?.label && (item?.type || item?.link))
        .map((item, index) => {
          const matchedType = types.find(
            (type) => normalizeTypeName(type.Type) === normalizeTypeName(item.type),
          );
          return {
            id: item.id || `configured-category-${index}`,
            label: getLocalizedText(item.labelTranslations, language, item.label),
            type: item.type || "",
            link: item.link || "",
            icon: item.icon || matchedType?.icon || getCategoryIcon(item.type),
            image: item.image || "",
            showSidebar: item.showSidebar !== false,
            showQuick: item.showQuick !== false,
          };
        });
    }
    return buildAutomaticCategories(types);
  }, [language, manageData?.homeCategoryConfig, types]);
  const sidebarCategories = homeCategories.filter((category) => category.showSidebar);
  const quickCategories = homeCategories.filter((category) => category.showQuick);
  const hasSidebarCategories = (
    manageData?.homeCategoryConfig?.configured
      ? manageData.homeCategoryConfig.showSidebar !== false
      : true
  ) && sidebarCategories.length > 0;
  const showQuickCategories = (
    manageData?.homeCategoryConfig?.configured
      ? manageData.homeCategoryConfig.showQuickCategories !== false
      : true
  ) && quickCategories.length > 0;
  const sidebarTitle = manageData?.homeCategoryConfig?.configured
    ? getLocalizedText(
        manageData.homeCategoryConfig.sidebarTitleTranslations,
        language,
        manageData.homeCategoryConfig.sidebarTitle || t("product_categories")
      )
    : t("product_categories");
  const featuredBrandImages = useMemo(() => {
    if (!Array.isArray(manageData?.partners)) return [];
    return manageData.partners.filter(isImageAsset);
  }, [manageData?.partners]);
  const shouldRotateBrands = featuredBrandImages.length >= 6;
  const rotatingBrandImages = featuredBrandImages.length === 6
    ? [...featuredBrandImages, ...featuredBrandImages]
    : featuredBrandImages;

  const section1Products = useMemo(() => {
    if (!manageData?.section1) return [];
    return (manageData.section1.productId || [])
      .map((id) => products.find((p) => p._id === id))
      .filter(Boolean);
  }, [manageData?.section1, products]);

  const specialSections = useMemo(() => {
    const list = [];
    for (let i = 2; i <= 11; i++) {
      const key = `section${i}`;
      const sec = manageData?.[key];
      if (sec && sec.display !== false) {
        const secProducts = (sec.productId || [])
          .map((id) => products.find((p) => p._id === id))
          .filter(Boolean);
        if (secProducts.length >= 5) {
          list.push({
            key,
            name: getLocalizedText(sec.nameTranslations, language, sec.name),
            filterName: sec.name,
            image: sec.image,
            products: secProducts.slice(0, 5), // Lấy tối đa đúng 5 sản phẩm
          });
        }
      }
    }
    return list;
  }, [language, manageData, products]);

  return (
    <main className="customer-home">
      <div className="home-shell">
        <section className={`home-hero-grid${hasSidebarCategories ? "" : " home-hero-grid--without-categories"}`}>
          {hasSidebarCategories && (
            <aside className="home-category-panel">
              <div className="home-category-title">
                <i className="fa-solid fa-list" /> {sidebarTitle}
              </div>
              <div className="home-category-list">
                {sidebarCategories.map((category) => (
                  <HomeCategoryLink key={category.id} category={category}>
                    <span><HomeCategoryIcon icon={category.icon} />{category.label}</span>
                    <i className="fa-solid fa-angle-right" />
                  </HomeCategoryLink>
                ))}
              </div>
              <Link className="home-category-all" to="/product">
                <i className="fa-solid fa-border-all" /> {t("view_all_categories")}
              </Link>
            </aside>
          )}

          <div className="home-hero-slider">
            <Swiper
              modules={[Pagination, Autoplay]}
              pagination={{ clickable: true }}
              autoplay={{ delay: 5000, disableOnInteraction: false }}
              loop={heroImages.length > 1}
            >
              {heroImages.map((image, index) => (
                <SwiperSlide key={`${image}-${index}`}>
                  <div className="home-hero-slide" style={{ backgroundImage: `url(${image})` }}>
                    <div className="home-hero-overlay" />
                    <div className="home-hero-copy">
                      <p className="home-hero-eyebrow">{t("industrial_solutions")}</p>
                      <h1>{t("equipment_solutions")}<br /><span>{t("for_industrial_equipment_systems")}</span></h1>
                      <ul>
                        <li><i className="fa-regular fa-circle-check" /> {t("genuine_quality")}</li>
                        <li><i className="fa-regular fa-circle-check" /> {t("expert_technical_consulting")}</li>
                        <li><i className="fa-regular fa-circle-check" /> {t("official_warranty")}</li>
                      </ul>
                      <div className="home-hero-actions">
                        <a className="home-primary-button" href="https://Nova.vn" target="_blank" rel="noreferrer">{t("explore_now")}</a>
                      </div>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </section>

        {showQuickCategories && (
          <section className="home-quick-categories" aria-label={t("featured_categories")}>
            {quickCategories.map((category) => {
              const matchingProduct = category.type
                ? products.find((product) => product.type?.trim() === category.type.trim())
                : null;
              const image = category.image || matchingProduct?.variant?.[0]?.imgUrl || "";
              return (
                <HomeCategoryLink key={category.id} category={category}>
                  <div className="home-quick-category-image">
                    {image ? (
                      <img src={resolveStorefrontAssetUrl(image)} alt="" />
                    ) : (
                      <HomeCategoryIcon icon={category.icon} />
                    )}
                  </div>
                  <span>{category.label}</span>
                </HomeCategoryLink>
              );
            })}
            <Link className="home-quick-category-more" to="/product">
              <div className="home-quick-category-image"><i className="fa-solid fa-border-all" /></div>
              <span>{t("view_all")}</span>
            </Link>
          </section>
        )}

        {section1Products.length >= 6 && manageData?.section1?.display !== false && (
          <section className="home-section home-section--framed">
            <SectionHeader title={manageData?.section1?.name || t("best_selling_products")} />
            {loading ? (
              <div className="home-loading-row">{t("loading_products")}</div>
            ) : (
              <Swiper
                modules={[Autoplay]}
                spaceBetween={12}
                slidesPerView={1.55}
                loop={section1Products.length > 1}
                autoplay={{
                  delay: 3000,
                  disableOnInteraction: false,
                  pauseOnMouseEnter: true,
                }}
                breakpoints={{
                  390: { slidesPerView: 1.75 },
                  480: { slidesPerView: 2.2 },
                  761: { slidesPerView: 2, spaceBetween: 16 },
                  768: { slidesPerView: 3, spaceBetween: 16 },
                  1024: { slidesPerView: 4, spaceBetween: 16 },
                  1280: { slidesPerView: 5, spaceBetween: 16 },
                  1440: { slidesPerView: 6, spaceBetween: 16 },
                }}
                className="home-product-swiper"
              >
                {section1Products.map((product) => {
                  const variant = product.variant?.[0] || {};
                  const canPurchase = !isContactOnlyVariant(variant);
                  return (
                    <SwiperSlide key={product._id}>
                      <article className="home-product-card" style={{ height: "100%", margin: "2px" }}>
                        <Link className="home-product-image" to={`/product/${product._id}`}>
                          <SafeProductImage
                            src={getVersionedImageUrl(variant.imgUrl, product.updatedAt || product._id)}
                            alt={product.name}
                            className="home-product-canvas"
                          />
                        </Link>
                        <div className="home-product-brand">{product.brand || "Nova"}</div>
                        <Link className="home-product-name" to={`/product/${product._id}`}>{product.name}</Link>
                        <div className="home-product-rating"><span>★★★★★</span> <small>({product.reviewCount || 0})</small></div>
                        <div className="home-product-price">
                          {formatVariantPrice(variant)}
                        </div>
                        <div className="home-product-actions">
                          <button
                            type="button"
                            disabled={!canPurchase}
                            onClick={() => canPurchase && addToCart(product._id, 0, 1)}
                            aria-label={`${t("add_product_to_cart")}: ${product.name}`}
                          >
                            <i className="fa-solid fa-cart-shopping" />
                          </button>
                        </div>
                      </article>
                    </SwiperSlide>
                  );
                })}
              </Swiper>
            )}
          </section>
        )}

        {/* 10 mục đặc biệt */}
        {specialSections.map((sec) => (
          <section key={sec.key} className="home-category-row home-section--framed">
            {/* Khối trái cố định */}
            <div className={`category-highlight-card ${sec.image ? "has-image" : ""}`}>
              <div className="highlight-image-box">
                {sec.image ? (
                  <img src={resolveStorefrontAssetUrl(sec.image)} alt={sec.name} className="highlight-img" />
                ) : (
                  <div className="highlight-img-placeholder"><i className="fa-solid fa-microchip" /></div>
                )}
              </div>
              <div className="highlight-info-group">
                <h3 className="highlight-title">{sec.name || t("category")}</h3>
                <Link to={resolveSectionLink(sec.filterName, types)} className="highlight-more-btn">
                  {t("view_more")}
                </Link>
              </div>
            </div>

            {/* Khối phải trượt Swiper */}
            <div className="category-slider-wrapper">
              <Swiper
                modules={[Navigation, Autoplay]}
                navigation
                spaceBetween={12}
                slidesPerView={1.55}
                loop={sec.products.length > 1}
                autoplay={{
                  delay: 4000,
                  disableOnInteraction: false,
                  pauseOnMouseEnter: true,
                }}
                breakpoints={{
                  390: { slidesPerView: 1.75 },
                  480: { slidesPerView: 2.2 },
                  761: { slidesPerView: 2, spaceBetween: 16 },
                  768: { slidesPerView: 3, spaceBetween: 16 },
                  1024: { slidesPerView: 4, spaceBetween: 16 },
                  1280: { slidesPerView: 5, spaceBetween: 16 },
                }}
                className="home-category-swiper"
              >
                {sec.products.map((product) => {
                  const variant = product.variant?.[0] || {};
                  const canPurchase = !isContactOnlyVariant(variant);
                  return (
                    <SwiperSlide key={product._id}>
                      <article className="home-product-card" style={{ height: "100%", margin: "2px" }}>
                        <Link className="home-product-image" to={`/product/${product._id}`}>
                          <SafeProductImage
                            src={getVersionedImageUrl(variant.imgUrl, product.updatedAt || product._id)}
                            alt={product.name}
                            className="home-product-canvas"
                          />
                        </Link>
                        <div className="home-product-brand">{product.brand || "Nova"}</div>
                        <Link className="home-product-name" to={`/product/${product._id}`}>{product.name}</Link>
                        
                        {/* Thông số kỹ thuật chi tiết */}
                        <div className="home-product-specs">
                          <div><span>{t("product_type_label")}</span> <strong>{product.type || "N/A"}</strong></div>
                          <div><span>{t("cluster_label")}</span> <strong>{product.section || "N/A"}</strong></div>
                          <div><span>{t("equipment_label")}</span> <strong>{product.value || "N/A"}</strong></div>
                        </div>

                        <div className="home-product-price">
                          {formatVariantPrice(variant)}
                        </div>
                        <div className="home-product-actions">
                          <button
                            type="button"
                            disabled={!canPurchase}
                            onClick={() => canPurchase && addToCart(product._id, 0, 1)}
                            aria-label={`${t("add_product_to_cart")}: ${product.name}`}
                          >
                            <i className="fa-solid fa-cart-shopping" />
                          </button>
                        </div>
                      </article>
                    </SwiperSlide>
                  );
                })}
              </Swiper>
            </div>
          </section>
        ))}

        {manageData?.displayPartners !== false && featuredBrandImages.length > 0 && (
          <section className="home-section home-brand-section">
            <SectionHeader title={t("featured_brands")} showViewAll={false} />
            {shouldRotateBrands ? (
              <Swiper
                modules={[Autoplay]}
                loop
                speed={650}
                spaceBetween={14}
                slidesPerView={1.45}
                autoplay={{
                  delay: 2200,
                  disableOnInteraction: false,
                  pauseOnMouseEnter: true,
                }}
                breakpoints={{
                  480: { slidesPerView: 2.2 },
                  768: { slidesPerView: 3 },
                  1024: { slidesPerView: 4 },
                  1280: { slidesPerView: 6 },
                }}
                className="home-brand-swiper"
              >
                {rotatingBrandImages.map((image, index) => (
                  <SwiperSlide key={`${image}-${index}`}>
                    <div className="home-brand-logo-card">
                      <img
                        src={resolveStorefrontAssetUrl(image)}
                        alt={`${t("featured_brands")} ${(index % featuredBrandImages.length) + 1}`}
                      />
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>
            ) : (
              <div className="home-brand-grid">
                {featuredBrandImages.map((image, index) => (
                  <div className="home-brand-logo-card" key={`${image}-${index}`}>
                    <img
                      src={resolveStorefrontAssetUrl(image)}
                      alt={`${t("featured_brands")} ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}

export default Dashboard;
