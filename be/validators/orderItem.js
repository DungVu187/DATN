const mongoose = require('mongoose');

function validateOrderItemInput(item) {
  const quantity = Number(item.quantity);
  const variantIndex = Number(item.variantIndex);

  if (!mongoose.Types.ObjectId.isValid(item.productId)) {
    return { message: 'Sản phẩm không hợp lệ' };
  }

  if (!Number.isInteger(variantIndex) || variantIndex < 0) {
    return { message: 'Phiên bản sản phẩm không hợp lệ' };
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { message: 'Số lượng không hợp lệ' };
  }

  return {
    value: {
      productId: String(item.productId),
      variantIndex,
      quantity,
    },
  };
}

module.exports = {
  validateOrderItemInput,
};
