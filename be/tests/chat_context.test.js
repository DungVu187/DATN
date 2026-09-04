const {
    getProductAvailability,
    toPublicProduct,
} = require('../services/chatContext');

describe('chat context public product contract', () => {
    it('exposes direct-sale price and stock without private pricing fields', () => {
        const product = toPublicProduct({
            _id: '507f1f77bcf86cd799439011',
            name: 'PLC Siemens',
            code: 'PLC-1',
            brand: 'Siemens',
            type: 'PLC',
            section: 'Tủ điện',
            value: 'Thiết bị',
            description: 'Mô tả',
            features: 'Tính năng',
            specifications: 'CPU: 1214C',
            warranty: '1 năm',
            variant: [{
                price: '6850000',
                importPrice: '5000000',
                earn: 25,
                quantityForSale: 20,
                imgUrl: '/images/plc.png',
            }],
        });

        expect(product).toEqual(expect.objectContaining({
            productId: '507f1f77bcf86cd799439011',
            availability: 'available',
        }));
        expect(product.variants[0]).toEqual(expect.objectContaining({
            price: '6850000',
            quantityForSale: 20,
            contactForPrice: false,
        }));
        expect(product.variants[0]).not.toHaveProperty('importPrice');
        expect(product.variants[0]).not.toHaveProperty('earn');
    });

    it('distinguishes out-of-stock and in-stock contact-for-price products', () => {
        expect(getProductAvailability([{
            price: '',
            earn: 25,
            quantityForSale: 4,
        }])).toBe('contact_for_price');
        expect(getProductAvailability([{
            price: '120000',
            earn: 25,
            quantityForSale: 0,
        }])).toBe('out_of_stock');
    });
});
