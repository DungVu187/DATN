const mongoose = require('mongoose');
const { removeVietnameseTones } = require('../utils/textNormalization');

const DEFAULT_PRODUCT_EARN = 25;

const productSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    nameUnsigned: {
        type: String,
        trim: true,
        index: true
    },
    display: {
        type: Boolean,
        default: 1
    },
    code: {
        type: String,
        trim: true,
        set: value => {
            if (value === undefined || value === null) return undefined;
            const normalized = String(value).trim();
            return normalized || undefined;
        },
        sparse: true,  // Sản phẩm chưa có mã sẽ không được đưa vào unique index.
        unique: true   // Nếu có mã thì không được trùng nhau.
    },
    vat: {
        type: String,
        trim: true,
        default: ""
    },
    adjusted: {
        type: Boolean,
        default: true
    },
    brand: {
        type: String,
        required: true,
        trim: true,
    },
    section: {
        type: String,
        required: true,
    },
    value: {
        type: String,
        required: true,
    },
    variant: {
        type: [
            {
                price: { type: String, default: "" },
                importPrice: { type: String, default: "" },
                earn: { type: Number, default: DEFAULT_PRODUCT_EARN },
                imgUrl: { type: String, default: "" },
                color: { type: String, default: "" },
                shape: { type: String, default: "" },
                buttonCount: { type: String, default: "" },
                frame: { type: String, default: "" },
                quantityForSale: { type: Number, default: 0, min: 0 },
                quantityInStorage: { type: Number, default: 0, min: 0 },
                note: { type: String, default: "" }
            }
        ],
        default: [{
            price: "",
            imgUrl: "",
            color: "",
            shape: "",
            buttonCount: "",
            frame: "",
            quantityForSale: 0,
            quantityInStorage: 0,
            note: ""
        }],
        validate: {
            validator: (variants) => {
                const ids = (variants || []).map((item) => String(item?._id || ''));
                return ids.length === new Set(ids).size;
            },
            message: 'Mỗi phiên bản sản phẩm phải có định danh riêng biệt',
        },
    },
    infoDoc: {
        type: {
            manual: { type: String, default: "" },
            dataSheet: { type: String, default: "" },
            catalog: { type: String, default: "" },
            others: { type: String, default: "" }
        },
    },
    documents: [
        {
            label: { type: String, default: "" },
            url: { type: String, default: "" },
            sourceType: { type: String, default: "" }
        }
    ],
    purchaseCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    reviews: [
        {
            email: { type: String, required: true },
            comment: { type: String, default: "" },
            rating: { type: Number, min: 1, max: 5, required: true },
            createdAt: { type: Date, default: Date.now },
        }
    ],
    totalRating: {
        type: Number,
        default: 0,
    },
    reviewCount: {
        type: Number,
        default: 0,
    },
    averageReviews: {
        type: Number,
        default: 0,
    },
    warranty: {
        type: String,
        required: true,
    },
    solution: {
        type: String,
        default: "",
    },
    description: {
        type: String,
        default: "",
    },
    features: {
        type: String,
        default: "",
    },
    operatingMethod: {
        type: String,
        default: "",
    },
    advantages: {
        type: String,
        default: "",
    },
    specifications: {
        type: String,
        default: "",
    }
}, { timestamps: true });

productSchema.pre('save', function (next) {
    if (this.isModified('name')) {
        this.nameUnsigned = removeVietnameseTones(this.name);
    }
    next();
});

const getUpdatedImgUrl = (originalUrl) => {
    if (!originalUrl) return originalUrl;

    const paths = ['/images/', '/section-images/'];
    for (const p of paths) {
        const idx = originalUrl.indexOf(p);
        if (idx !== -1) {
            return originalUrl.substring(idx);
        }
    }
    return originalUrl;
};

productSchema.post('init', function (doc) {
    if (doc.variant && Array.isArray(doc.variant)) {
        doc.variant.forEach(v => {
            if (v.imgUrl) {
                v.imgUrl = getUpdatedImgUrl(v.imgUrl);
            }
        });
    }
});

productSchema.set('toJSON', {
    transform: (doc, ret) => {
        if (ret.variant && Array.isArray(ret.variant)) {
            ret.variant.forEach(v => {
                if (v.imgUrl) {
                    v.imgUrl = getUpdatedImgUrl(v.imgUrl);
                }
            });
        }
        return ret;
    }
});

productSchema.set('toObject', {
    transform: (doc, ret) => {
        if (ret.variant && Array.isArray(ret.variant)) {
            ret.variant.forEach(v => {
                if (v.imgUrl) {
                    v.imgUrl = getUpdatedImgUrl(v.imgUrl);
                }
            });
        }
        return ret;
    }
});

const Product = mongoose.model('Product', productSchema);

module.exports = {
    Product,
    productSchema,
    DEFAULT_PRODUCT_EARN,
};
