const { Product } = require('../models/product');

async function enrichInventoryOrderLines(productList, mapLine) {
  return Promise.all((productList || []).map(async (item) => {
    const product = await Product.findById(item.productId).lean();
    return mapLine(item, product);
  }));
}

module.exports = {
  enrichInventoryOrderLines,
};
