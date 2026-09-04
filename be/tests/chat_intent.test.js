const { classifyChatIntent } = require('../services/chatIntent');

describe('chat intent classification', () => {
    it('classifies common greetings before falling back to out-of-scope', () => {
        expect(classifyChatIntent('Xin chào')).toBe('greeting');
        expect(classifyChatIntent('Chào bạn')).toBe('greeting');
        expect(classifyChatIntent('hello')).toBe('greeting');
    });

    it('classifies product and policy questions', () => {
        expect(classifyChatIntent('Tìm PLC Siemens')).toBe('product_search');
        expect(classifyChatIntent('Còn hàng không?')).toBe('stock_query');
        expect(classifyChatIntent('Bao giờ giao hàng?')).toBe('shipping_query');
        expect(classifyChatIntent('Sản phẩm được bảo hành thế nào?')).toBe('warranty_query');
        expect(classifyChatIntent('???')).toBe('nonsense_query');
    });
});
