const DEFAULT_PRODUCT_TYPE_ICON = "ri-tb-box-multiple";
const PRODUCT_TYPE_ICON_PATTERN = /^(ri-[a-z0-9-]+|fa-[a-z0-9-]+)$/;

const PRODUCT_TYPE_ICON_ENTRIES = [
  ["Đèn", "ri-tb-bulb"],
  ["Quạt", "ri-tb-propeller"],
  ["PLC", "ri-tb-cpu"],
  ["Contactor", "ri-tb-circuit-switch-closed"],
  ["Chống sét", "ri-tb-bolt"],
  ["Cuộn hút", "ri-tb-magnet"],
  ["Van điện từ", "ri-gi-valve"],
  ["Nhông xích", "ri-tb-settings-automation"],
  ["Dây curoa", "ri-tb-link"],
  ["Aptomat", "ri-tb-circuit-switch-open"],
  ["Relay Nhiệt", "ri-tb-temperature"],
  ["Relay Trung Gian", "ri-tb-circuit-changeover"],
  ["Relay Thời Gian", "ri-tb-clock-cog"],
  ["Nút Nhấn", "ri-tb-circuit-pushbutton"],
  ["Nguồn", "ri-tb-power"],
  ["Bảo Vệ Mất, Ngược Pha", "ri-tb-shield-bolt"],
  ["Loadcell", "ri-tb-scale"],
  ["Xy lanh khí nén", "ri-tb-cylinder"],
  ["Bộ lọc khí", "ri-tb-filter"],
  ["Phụ kiện khí nén", "ri-tb-tool"],
  ["TI", "ri-tb-circuit-ammeter"],
  ["Dây điện", "ri-tb-plug-connected"],
  ["Thùng cân PGL", "ri-gi-round-silo"],
  ["Van khí nén", "ri-tb-wind"],
  ["Vật tư phụ khác", DEFAULT_PRODUCT_TYPE_ICON],
  ["Lọc bụi", "ri-gi-dust-cloud"],
  ["Biến áp cách ly", "ri-tb-transform"],
  ["Cầu Đấu", "ri-tb-circuit-cell"],
  ["Biến tần", "ri-tb-gauge"],
  ["Cảm biến", "ri-tb-photo-sensor"],
];

const normalizeProductTypeName = (value = "") =>
  String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const PRODUCT_TYPE_ICON_MAP = new Map(
  PRODUCT_TYPE_ICON_ENTRIES.map(([typeName, icon]) => [
    normalizeProductTypeName(typeName),
    icon,
  ]),
);

const inferProductTypeIcon = (typeName) =>
  PRODUCT_TYPE_ICON_MAP.get(normalizeProductTypeName(typeName)) ||
  DEFAULT_PRODUCT_TYPE_ICON;

const isValidProductTypeIcon = (icon) =>
  PRODUCT_TYPE_ICON_PATTERN.test(String(icon || "").trim());

const normalizeProductTypeIcon = (icon, typeName) => {
  const normalizedIcon = String(icon || "").trim();
  return normalizedIcon || inferProductTypeIcon(typeName);
};

const serializeProductType = (typeDocument) => {
  const value = typeDocument?.toObject
    ? typeDocument.toObject()
    : { ...(typeDocument || {}) };

  return {
    ...value,
    icon: normalizeProductTypeIcon(value.icon, value.Type),
  };
};

module.exports = {
  DEFAULT_PRODUCT_TYPE_ICON,
  PRODUCT_TYPE_ICON_ENTRIES,
  inferProductTypeIcon,
  isValidProductTypeIcon,
  normalizeProductTypeIcon,
  normalizeProductTypeName,
  serializeProductType,
};
