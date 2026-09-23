const { verifyAdvisoryText } = require('../services/chatGrounding');

const evidence = {
    products: [
        { productId: 'p1', name: 'Contactor S-T35 AC200V 2A2B', code: 'S-T35', type: 'Contactor', brand: 'Mitsubishi', availability: 'available' },
    ],
    facts: [
        { id: 'f0_spec', productId: 'p1', kind: 'specifications', text: 'Thông số: 15 kW / 35 A, điện áp 380V, cuộn hút 220V AC.' },
        { id: 'f1_price', productId: 'p1', kind: 'price', text: 'Giá 1.250.000 đ.' },
    ],
    reasons: [{ id: 'r0_type', productId: 'p1', text: 'đúng nhóm Contactor' }],
    questionKeys: [],
};

const verify = (text) => verifyAdvisoryText(text, { evidence });

describe('kiểm chứng lời tư vấn do model viết', () => {
    it('giữ nguyên đoạn văn chỉ dùng số có trong bằng chứng', () => {
        const result = verify('Với tải 15 kW chạy điện áp 380V, mình thấy dòng Contactor S-T35 là hợp lý nhất. Bạn kiểm tra thêm dòng cắt thực tế của tủ nhé.');
        expect(result.violations).toEqual([]);
        expect(result.text).toContain('S-T35');
    });

    it('bỏ cả đoạn khi model bịa ra con số không có trong bằng chứng', () => {
        const result = verify('Contactor này chịu được 500 A nên dư sức cho tải của bạn.');
        expect(result.text).toBe('');
        expect(result.violations.some((item) => item.startsWith('so_la:'))).toBe(true);
    });

    it('bỏ cả đoạn khi model bịa ra mã hàng shop không bán', () => {
        const result = verify('Bạn nên lấy dòng LC1D18M7 cho tải này.');
        expect(result.text).toBe('');
        expect(result.violations.some((item) => item.startsWith('ma_la:'))).toBe(true);
    });

    it('chặn lời hứa không kiểm chứng được và đường dẫn ngoài', () => {
        expect(verify('Hàng này chắc chắn tương thích với tủ của bạn.').text).toBe('');
        expect(verify('Bên mình đang có khuyến mãi cho dòng này.').text).toBe('');
        expect(verify('Bạn xem thêm tại https://example.com nhé.').text).toBe('');
    });

    it('cho phép số đếm nhỏ dùng để dẫn dắt và giá viết theo kiểu phân cách nghìn', () => {
        expect(verify('Mình gợi ý 1 phương án chính cho bạn.').violations).toEqual([]);
        expect(verify('Mức 1.250.000 đ là giá của dòng này.').violations).toEqual([]);
    });

    it('gỡ ký tự markdown vì frontend render text thuần', () => {
        expect(verify('**Mình gợi ý dòng này cho bạn.**').text).toBe('Mình gợi ý dòng này cho bạn.');
    });

    it('bỏ đoạn dài quá khổ để không lấn át danh sách sản phẩm', () => {
        expect(verify('Mình tư vấn cho bạn. '.repeat(40)).text).toBe('');
    });
});
