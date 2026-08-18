const { Product } = require('../models/product');

function getUpdatedImgUrl(originalUrl) {
  if (!originalUrl) return originalUrl;
  const address = process.env.ADDRESS;
  if (!address) return originalUrl;

  const paths = ['/images/', '/section-images/'];
  for (const imagePath of paths) {
    const index = originalUrl.indexOf(imagePath);
    if (index !== -1) {
      return address.replace(/\/$/, '') + originalUrl.substring(index);
    }
  }
  return originalUrl;
}

async function enrichCartItems(cartItems) {
  return Promise.all((cartItems || []).map(async (item) => {
    const product = await Product.findById(item.productId);
    const variant = product?.variant?.[item.variantIndex] || {};
    return {
      productId: item.productId,
      variantIndex: item.variantIndex,
      quantity: item.quantity,
      name: product?.name || '',
      code: product?.code || '',
      brand: product?.brand || '',
      imgUrl: getUpdatedImgUrl(variant.imgUrl) || '',
      price: variant.price || '0',
    };
  }));
}

async function formatAdminOrderDetail(order) {
  return {
    _id: order._id,
    orderCode: order.orderCode,
    userName: order.userName,
    userPhone: order.userPhone,
    status: order.status,
    payment: order.payment,
    state: order.state,
    total: order.total,
    completedAt: order.completedAt,
    images: order.images || [],
    cartItems: await enrichCartItems(order.cartItems),
  };
}

async function formatAdminOrderWithItems(order) {
  return {
    ...order.toObject(),
    cartItems: await enrichCartItems(order.cartItems),
  };
}

async function formatCustomerOrderDetail(order) {
  const cartDetails = await Promise.all(
    order.cartItems.map(async (item) => {
      const product = await Product.findById(item.productId);
      if (!product) return null;

      const variant = product.variant[item.variantIndex] || {};
      return {
        name: product.name,
        brand: product.brand,
        variant: {
          color: variant.color,
          shape: variant.shape,
          price: variant.price,
          imgUrl: getUpdatedImgUrl(variant.imgUrl),
        },
        quantity: item.quantity,
      };
    })
  );

  return {
    userPhone: order.userPhone,
    total: order.total,
    cartItems: cartDetails.filter(Boolean),
    status: order.status,
    payment: order.payment,
  };
}

module.exports = {
  enrichCartItems,
  formatAdminOrderDetail,
  formatAdminOrderWithItems,
  formatCustomerOrderDetail,
  getUpdatedImgUrl,
};
