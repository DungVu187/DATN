const { authenticateUser } = require('../middlewares/auth');
const { User } = require('../models/user');
const { Product } = require('../models/product');
const {
    buildProductVisibilityFilter,
    combineProductFilters,
} = require('../services/productAccess');
const { isContactOnlyVariant } = require('../services/productPricing');
const express = require('express');
const router = express.Router();

const findAccessibleProduct = async (user, productId) => {
    const { filter } = await buildProductVisibilityFilter(user);
    return Product.findOne(combineProductFilters({ _id: productId }, filter));
};

const serializeCartWithAvailability = async (user) => {
    const productIds = Array.from(new Set(user.cart.map((item) => String(item.productId))));
    if (productIds.length === 0) return [];

    const { filter } = await buildProductVisibilityFilter(user);
    const products = await Product.find(combineProductFilters(
        { _id: { $in: productIds } },
        filter
    )).select('_id variant').lean();
    const productsById = new Map(products.map((product) => [String(product._id), product]));

    return user.cart.map((item) => {
        const product = productsById.get(String(item.productId));
        const variant = product?.variant?.[item.variantIndex];
        return {
            ...item.toObject(),
            available: Boolean(product && variant && !isContactOnlyVariant(variant)),
        };
    });
};

router.post('/addToCart', authenticateUser, async (req, res) => {
    const { productId } = req.body;
    const variantIndex = Number(req.body.variantIndex);
    
    // Validate & sanitize quantity
    let quantity = 1;
    if (req.body.quantity !== undefined) {
        const parsed = parseInt(req.body.quantity, 10);
        if (!isNaN(parsed) && parsed > 0) {
            quantity = parsed;
        }
    }

    try {
        // Lấy user từ database
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const product = await findAccessibleProduct(user, productId);
        if (!product) {
            return res.status(403).json({ message: 'Sản phẩm không khả dụng cho tài khoản này.' });
        }
        if (!Number.isInteger(variantIndex) || variantIndex < 0 || !product.variant[variantIndex]) {
            return res.status(400).json({ message: 'Phiên bản sản phẩm không hợp lệ.' });
        }
        if (isContactOnlyVariant(product.variant[variantIndex])) {
            return res.status(409).json({ message: 'Sản phẩm này hiện chỉ nhận liên hệ.' });
        }

        // Kiểm tra sản phẩm đã có trong giỏ hàng hay chưa
        const existingCartItem = user.cart.find(
            (item) => item.productId.toString() === productId && item.variantIndex === variantIndex
        );

        if (existingCartItem) {
            existingCartItem.quantity = (existingCartItem.quantity || 1) + quantity;
        } else {
            user.cart.push({ productId, variantIndex, quantity });
        }

        await user.save();
        res.status(200).json({ message: 'Product added to cart successfully', cart: user.cart });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.put('/updateStatus', authenticateUser, async (req, res) => {
    const { productId, status } = req.body;
    const variantIndex = Number(req.body.variantIndex);
    try {
        // Validate user existence
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Find the cart item
        const cartItem = user.cart.find(
            (item) => item.productId.toString() === productId && item.variantIndex === variantIndex
        );
        if (!cartItem) {
            return res.status(404).json({ message: 'Cart item not found' });
        }
        if (status === true) {
            const product = await findAccessibleProduct(user, productId);
            if (!product) {
                return res.status(403).json({ message: 'Sản phẩm không khả dụng cho tài khoản này.' });
            }
            const variant = product.variant[variantIndex];
            if (!variant || isContactOnlyVariant(variant)) {
                return res.status(409).json({ message: 'Sản phẩm này hiện chỉ nhận liên hệ.' });
            }
        }
        // Update the status
        cartItem.status = status;
        await user.save();

        res.status(200).json({ message: 'Cart item status updated successfully', cart: user.cart });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.put('/updateCartItem', authenticateUser, async (req, res) => {
    const { productId, quantity } = req.body;
    const variantIndex = Number(req.body.variantIndex);
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const product = await findAccessibleProduct(user, productId);
        if (!product) {
            return res.status(403).json({ message: 'Sản phẩm không khả dụng cho tài khoản này.' });
        }
        const variant = product.variant[variantIndex];
        if (!variant || isContactOnlyVariant(variant)) {
            return res.status(409).json({ message: 'Sản phẩm này hiện chỉ nhận liên hệ.' });
        }
        const cartItem = user.cart.find(
            (item) => item.productId.toString() === productId && item.variantIndex === variantIndex
        );
        if (cartItem) {
            cartItem.quantity = Math.max(1, Number(quantity));
        }
        await user.save();
        res.json({ cart: user.cart });
    } catch (error) {
        console.error('Error updating cart item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/getCart', authenticateUser, async (req, res) => {
    const userId = req.user.userId;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const cart = await serializeCartWithAvailability(user);
        res.status(200).json({ cart });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/removeFromCart', authenticateUser, async (req, res) => {
    const { productId, variantIndex } = req.body;
    try {
        // Validate user existence
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Remove the cart item
        user.cart = user.cart.filter(
            (item) => !(item.productId.toString() === productId && item.variantIndex === variantIndex)
        );
        await user.save();

        res.status(200).json({ message: 'Product removed from cart successfully', cart: user.cart });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/clearCart', authenticateUser, async (req, res) => {
    try {
        // Validate user existence
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Clear the cart
        user.cart = [];
        await user.save();

        res.status(200).json({ message: 'Cart cleared successfully', cart: user.cart });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = {
    router
};
