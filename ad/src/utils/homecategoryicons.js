export const normalizeTypeName = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const PRODUCT_TYPE_ICON_ENTRIES = [
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
  ["Vật tư phụ khác", "ri-tb-box-multiple"],
  ["Lọc bụi", "ri-gi-dust-cloud"],
  ["Biến áp cách ly", "ri-tb-transform"],
  ["Cầu Đấu", "ri-tb-circuit-cell"],
  ["Biến tần", "ri-tb-gauge"],
  ["Cảm biến", "ri-tb-photo-sensor"],
];

const GENERIC_CATEGORY_ICON_OPTIONS = [
  ["Điều hòa / làm mát", "ri-tb-air-conditioning"],
  ["Ăng-ten", "ri-tb-antenna"],
  ["Pin / ắc quy", "ri-tb-battery"],
  ["Chuông báo", "ri-tb-bell"],
  ["Bluetooth", "ri-tb-bluetooth"],
  ["Nhà máy", "ri-tb-building-factory"],
  ["Máy công trình", "ri-tb-bulldozer"],
  ["Camera", "ri-tb-camera"],
  ["Trạm sạc", "ri-tb-charging-pile"],
  ["Biểu đồ", "ri-tb-chart-bar"],
  ["Mạch pin", "ri-tb-circuit-battery"],
  ["Tụ điện", "ri-tb-circuit-capacitor"],
  ["Diode", "ri-tb-circuit-diode"],
  ["Tiếp địa", "ri-tb-circuit-ground"],
  ["Cuộn cảm", "ri-tb-circuit-inductor"],
  ["Động cơ điện", "ri-tb-circuit-motor"],
  ["Điện trở", "ri-tb-circuit-resistor"],
  ["Đám mây", "ri-tb-cloud"],
  ["Cần cẩu", "ri-tb-crane"],
  ["Camera giám sát", "ri-tb-device-cctv"],
  ["Máy tính", "ri-tb-device-desktop"],
  ["Thiết bị di động", "ri-tb-device-mobile"],
  ["Nước / chất lỏng", "ri-tb-droplet"],
  ["Thang máy", "ri-tb-elevator"],
  ["Động cơ", "ri-tb-engine"],
  ["Lửa / nhiệt", "ri-tb-flame"],
  ["Xe nâng", "ri-tb-forklift"],
  ["Nhiên liệu", "ri-tb-gas-station"],
  ["Búa / thi công", "ri-tb-hammer"],
  ["Nhà thông minh", "ri-tb-home-cog"],
  ["Bảng điều khiển", "ri-tb-layout-dashboard"],
  ["Khóa", "ri-tb-lock"],
  ["Kính hiển vi", "ri-tb-microscope"],
  ["Xe máy", "ri-tb-motorbike"],
  ["Mạng", "ri-tb-network"],
  ["Ổ cắm", "ri-tb-outlet"],
  ["Đóng gói", "ri-tb-package"],
  ["Phích cắm", "ri-tb-plug"],
  ["Sóng vô tuyến", "ri-tb-radio"],
  ["Robot", "ri-tb-robot"],
  ["Bộ định tuyến", "ri-tb-router"],
  ["Vệ tinh", "ri-tb-satellite"],
  ["Máy chủ", "ri-tb-server"],
  ["Cài đặt", "ri-tb-settings"],
  ["Năng lượng mặt trời", "ri-tb-solar-panel"],
  ["Ống thí nghiệm", "ri-tb-test-pipe"],
  ["Xe tải", "ri-tb-truck"],
  ["Máy giặt", "ri-tb-wash-machine"],
  ["Wi-Fi", "ri-tb-wifi"],
  ["Điện gió", "ri-tb-windmill"],
  ["Toàn cầu", "ri-tb-world"],
  ["Mã kỹ thuật", "ri-tb-zoom-code"],
];

export const CATEGORY_ICON_OPTIONS = [
  ...PRODUCT_TYPE_ICON_ENTRIES,
  ...GENERIC_CATEGORY_ICON_OPTIONS,
].map(([label, value]) => ({ value, label }));

const EXACT_TYPE_ICONS = new Map(
  PRODUCT_TYPE_ICON_ENTRIES.map(([type, icon]) => [normalizeTypeName(type), icon]),
);

const TYPE_ICON_RULES = [
  { keywords: ["den bao", "den chieu sang", "den"], icon: "ri-tb-bulb" },
  { keywords: ["quat", "fan"], icon: "ri-tb-propeller" },
  { keywords: ["chong set", "thiet bi cat set"], icon: "ri-tb-bolt" },
  { keywords: ["cuon hut", "coil"], icon: "ri-tb-magnet" },
  { keywords: ["van dien tu", "solenoid valve"], icon: "ri-gi-valve" },
  { keywords: ["van khi nen"], icon: "ri-tb-wind" },
  { keywords: ["nhong xich", "banh rang", "nhong"], icon: "ri-tb-settings-automation" },
  { keywords: ["day curoa", "curoa", "day dai"], icon: "ri-tb-link" },
  { keywords: ["relay nhiet", "ro le nhiet"], icon: "ri-tb-temperature" },
  { keywords: ["relay thoi gian", "ro le thoi gian", "timer"], icon: "ri-tb-clock-cog" },
  { keywords: ["relay trung gian", "ro le trung gian"], icon: "ri-tb-circuit-changeover" },
  { keywords: ["contactor", "khoi dong tu", "cong tac", "relay", "ro le"], icon: "ri-tb-circuit-switch-closed" },
  { keywords: ["nut nhan", "push button"], icon: "ri-tb-circuit-pushbutton" },
  { keywords: ["plc", "bo dieu khien", "module dieu khien"], icon: "ri-tb-cpu" },
  { keywords: ["bien tan", "inverter", "dong ho", "meter"], icon: "ri-tb-gauge" },
  { keywords: ["cam bien", "sensor"], icon: "ri-tb-photo-sensor" },
  { keywords: ["nguon", "power supply"], icon: "ri-tb-power" },
  { keywords: ["aptomat", "cau dao", "mccb", "mcb"], icon: "ri-tb-circuit-switch-open" },
  { keywords: ["loadcell", "can dien tu"], icon: "ri-tb-scale" },
  { keywords: ["xy lanh"], icon: "ri-tb-cylinder" },
  { keywords: ["loc bui"], icon: "ri-gi-dust-cloud" },
  { keywords: ["loc khi"], icon: "ri-tb-filter" },
  { keywords: ["khi nen"], icon: "ri-tb-tool" },
  { keywords: ["bien ap", "transformer"], icon: "ri-tb-transform" },
  { keywords: ["cau dau", "terminal"], icon: "ri-tb-circuit-cell" },
  { keywords: ["bao ve", "nguoc pha", "mat pha"], icon: "ri-tb-shield-bolt" },
];

export const getCategoryIcon = (type, fallback = "ri-tb-box-multiple") => {
  const normalizedType = normalizeTypeName(type);
  if (!normalizedType) return fallback || "ri-tb-box-multiple";

  const exactIcon = EXACT_TYPE_ICONS.get(normalizedType);
  if (exactIcon) return exactIcon;

  const matchedRule = TYPE_ICON_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedType.includes(keyword)),
  );

  return matchedRule?.icon || fallback || "ri-tb-box-multiple";
};
