const { Type } = require('../models/producttype');
const {
  DEFAULT_PRODUCT_TYPE_ICON,
  PRODUCT_TYPE_ICON_ENTRIES,
  inferProductTypeIcon,
  isValidProductTypeIcon,
  normalizeProductTypeIcon,
  normalizeProductTypeName,
  serializeProductType,
} = require('../utils/productType');

module.exports = {
  DEFAULT_PRODUCT_TYPE_ICON,
  PRODUCT_TYPE_ICON_ENTRIES,
  Type,
  inferProductTypeIcon,
  isValidProductTypeIcon,
  normalizeProductTypeIcon,
  normalizeProductTypeName,
  serializeProductType,
};
