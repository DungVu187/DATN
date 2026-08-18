const parseProductNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isContactOnlyVariant = (variant) => {
  if (!variant) return true;

  const earn = Number(variant.earn);
  const price = parseProductNumber(variant.price);
  const quantityForSale = Number(variant.quantityForSale || 0);

  return earn === 0 || price <= 0 || quantityForSale <= 0;
};

module.exports = {
  isContactOnlyVariant,
  parseProductNumber,
};
