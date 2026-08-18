const mongoose = require("mongoose");
const { createDefaultPolicies, storefrontPolicySchema } = require('../config/policydefaults');

const localizedTextSchema = new mongoose.Schema({
    vi: { type: String, default: '' },
    zh: { type: String, default: '' },
    en: { type: String, default: '' }
}, { _id: false });

const homeCategoryItemSchema = new mongoose.Schema({
    id: { type: String, default: '' },
    label: { type: String, default: '' },
    labelTranslations: { type: localizedTextSchema, default: () => ({}) },
    type: { type: String, default: '' },
    link: { type: String, default: '' },
    icon: { type: String, default: 'ri-tb-box-multiple' },
    image: { type: String, default: '' },
    showSidebar: { type: Boolean, default: true },
    showQuick: { type: Boolean, default: true }
}, { _id: false });

// Schema cho Manage
const manageSchema = new mongoose.Schema({
    overViewImg: {
        type: [String],
        default: []
    },
    partners: {
        type: [String],
        default: []
    },
    displayPartners: {
        type: Boolean,
        default: true
    },
    footerContent: {
        logo: { type: String, default: '' },
        description: { type: String, default: '' },
        address: { type: String, default: '' },
        phone: { type: String, default: '' },
        email: { type: String, default: '' }
    },
    newProductUrl: {
        type: String,
        default: ''
    },
    topPurchaseUrl: {
        type: String,
        default: ''
    },
    highestRatingUrl: {
        type: String,
        default: ''
    },
    introduction: {
        type: String,
        default: ''
    },
    introductionTranslations: {
        type: localizedTextSchema,
        default: () => ({})
    },
    mainPolicy: {
        type: String,
        default: ''
    },
    policies: {
        type: [storefrontPolicySchema],
        default: createDefaultPolicies
    },
    homeCategoryConfig: {
        configured: { type: Boolean, default: false },
        sidebarTitle: { type: String, default: 'Danh mục sản phẩm' },
        sidebarTitleTranslations: { type: localizedTextSchema, default: () => ({}) },
        showSidebar: { type: Boolean, default: true },
        showQuickCategories: { type: Boolean, default: true },
        items: { type: [homeCategoryItemSchema], default: [] }
    },
    section1: {
        name: {
            type: String,
            default: ''
        },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: {
            type: [String],
            default: []
        },
        display: {
            type: Boolean,
            default: true
        }
    },
    section2: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section3: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section4: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section5: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section6: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section7: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section8: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section9: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section10: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
    section11: {
        name: { type: String, default: '' },
        nameTranslations: { type: localizedTextSchema, default: () => ({}) },
        productId: { type: [String], default: [] },
        display: { type: Boolean, default: true },
        image: { type: String, default: '' },
        link: { type: String, default: '' }
    },
});

const Manage = mongoose.model("Manage", manageSchema);

module.exports = {
    Manage,
    manageSchema,
    localizedTextSchema,
    homeCategoryItemSchema,
};
