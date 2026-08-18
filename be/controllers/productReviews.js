const mongoose = require('mongoose');
const { Product } = require('../models/product');
const {
    ProductReviewValidationError,
    validateCreateReviewPayload,
    validateUpdateReviewPayload,
} = require('../validators/productReviews');

const MODERATOR_ROLES = ['admin', 'superadmin', 'staff'];

function sendInvalidObjectId(res, value, fieldName) {
    if (mongoose.Types.ObjectId.isValid(value)) return false;

    res.status(400).json({ message: fieldName + ' không hợp lệ' });
    return true;
}

function sendReviewError(res, error, serverMessage) {
    if (error instanceof ProductReviewValidationError
        || error instanceof mongoose.Error.ValidationError
        || error instanceof mongoose.Error.CastError) {
        res.status(400).json({ message: error.message });
        return true;
    }

    res.status(500).json({ message: serverMessage });
    return false;
}

async function getProductReviews(req, res) {
    try {
        if (sendInvalidObjectId(res, req.params._id, 'Product id')) return undefined;

        const product = await Product.findById(req.params._id).select('reviews');
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.json(product.reviews);
    } catch (error) {
        const handled = sendReviewError(res, error, 'Lỗi server khi lấy đánh giá sản phẩm');
        if (!handled) {
            console.error('Error fetching product reviews:', error);
        }
        return undefined;
    }
}

async function createProductReview(req, res) {
    try {
        const { comment, rating } = validateCreateReviewPayload(req.body);
        const email = req.user.email;
        const productId = req.params._id;
        if (sendInvalidObjectId(res, productId, 'Product id')) return undefined;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const review = {
            _id: new mongoose.Types.ObjectId(),
            email,
            comment,
            rating,
        };

        product.reviews.push(review);
        product.reviewCount = product.reviews.length;
        product.totalRating += rating;
        product.averageReviews = product.totalRating / product.reviewCount;

        await product.save();

        return res.status(201).json({ message: 'Review added successfully', review });
    } catch (error) {
        sendReviewError(res, error, 'Internal server error');
        return undefined;
    }
}

async function updateProductReview(req, res) {
    try {
        const { comment, rating } = validateUpdateReviewPayload(req.body);
        const { _id: productId, reviewId } = req.params;
        if (sendInvalidObjectId(res, productId, 'Product id')) return undefined;
        if (sendInvalidObjectId(res, reviewId, 'Review id')) return undefined;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const review = product.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        const isOwner = review.email === req.user.email;
        const isModerator = MODERATOR_ROLES.includes(req.user.role);
        if (!isOwner && !isModerator) {
            return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa đánh giá này.' });
        }

        if (comment) {
            review.comment = comment;
        }
        if (rating !== undefined) {
            product.totalRating = product.totalRating - review.rating + rating;
            review.rating = rating;
            product.averageReviews = product.totalRating / product.reviews.length;
        }

        await product.save();

        return res.status(200).json({ message: 'Review updated successfully', review });
    } catch (error) {
        sendReviewError(res, error, 'Internal server error');
        return undefined;
    }
}

async function deleteProductReview(req, res) {
    try {
        const { _id: productId, reviewId } = req.params;
        if (sendInvalidObjectId(res, productId, 'Product id')) return undefined;
        if (sendInvalidObjectId(res, reviewId, 'Review id')) return undefined;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const review = product.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        const isOwner = review.email === req.user.email;
        const isModerator = MODERATOR_ROLES.includes(req.user.role);
        if (!isOwner && !isModerator) {
            return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa đánh giá này.' });
        }

        product.totalRating -= review.rating;
        product.reviews.pull(reviewId);
        product.reviewCount = product.reviews.length;
        product.averageReviews = product.reviewCount > 0
            ? product.totalRating / product.reviewCount
            : 0;

        await product.save();

        return res.status(200).json({ message: 'Review deleted successfully', product });
    } catch (error) {
        sendReviewError(res, error, 'Internal server error');
        return undefined;
    }
}

module.exports = {
    getProductReviews,
    createProductReview,
    updateProductReview,
    deleteProductReview,
};
