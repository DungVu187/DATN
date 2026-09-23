const { classifyChatIntent } = require('../services/chatIntent');

describe('chat intent classification', () => {
    test.each([
        ['Tìm PLC Siemens', 'product_search'],
        ['Giá của sản phẩm này bao nhiêu?', 'price_query'],
        ['Sản phẩm này còn hàng không?', 'stock_query'],
        ['Có sản phẩm tương tự không?', 'similar_product'],
        ['Cho tôi thông số kỹ thuật', 'specification_query'],
        ['Chính sách giao hàng thế nào?', 'shipping_query'],
        ['Chính sách bảo hành thế nào?', 'warranty_query'],
        ['Chính sách mua hàng ra sao?', 'policy_query'],
        ['Chính sách bảo mật thông tin?', 'policy_query'],
        ['Kiểm tra đơn hàng của tôi', 'order_status_query'],
        ['Tôi cần tư vấn chọn sản phẩm', 'product_search'],
        ['Tôi muốn liên hệ nhân viên', 'human_handoff'],
    ])('classifies %s as %s', (message, expected) => {
        expect(classifyChatIntent(message)).toBe(expected);
    });

    test.each([
        'hiện tại còn hàng không',
        'hiện còn bao nhiêu cái',
    ])('does not treat %s as a greeting', (message) => {
        expect(classifyChatIntent(message)).not.toBe('greeting');
    });

    it('prioritizes purchase intent over policy when asking for a price', () => {
        expect(classifyChatIntent('Tôi muốn mua hàng này giá bao nhiêu')).toBe('price_query');
        expect(classifyChatIntent('Tôi muốn đặt hàng sản phẩm này')).toBe('product_search');
    });

    it('replaces every ambiguous phrase occurrence', () => {
        expect(classifyChatIntent('đánh giá sản phẩm và đánh giá lần nữa')).toBe('out_of_scope');
    });

    /**
     * `containsPhrase` khớp trọn cụm theo ranh giới khoảng trắng, nên danh sách literal
     * cũ ('mã đơn', 'kiểm tra đơn'...) vỡ ngay khi khách viết "đơn hàng". Bộ ca dưới đây
     * khóa lại các cách hỏi thật mà khách đã dùng.
     */
    describe('order status questions', () => {
        test.each([
            'Tôi muốn xem đơn hàng',
            'Xem đơn hàng',
            'đơn hàng',
            'Cho tôi xem đơn hàng',
            'Kiểm tra đơn hàng',
            'Kiểm tra đơn',
            'Tra cứu đơn hàng',
            'Theo dõi đơn hàng',
            'Trạng thái đơn hàng',
            'Đơn hàng của tôi đến đâu rồi',
            'Đơn hàng tôi đặt sao rồi',
            'Đơn hàng giao chưa',
            'Hàng của tôi tới đâu rồi',
            'Tôi đặt hàng rồi mà chưa thấy',
            'Tôi muốn xem lại đơn đã đặt',
            'Mã đơn của tôi là gì',
            'Lịch sử mua hàng',
        ])('classifies %s as order_status_query', (message) => {
            expect(classifyChatIntent(message)).toBe('order_status_query');
        });

        test.each([
            'Tôi muốn hủy đơn',
            'Hủy đơn hàng',
        ])('classifies %s as order_status_query so the bot can list orders then explain', (message) => {
            expect(classifyChatIntent(message)).toBe('order_status_query');
        });

        // Những câu chỉ "trông giống" đơn hàng: không được kéo vào luồng tra đơn.
        test.each([
            ['Đơn giá contactor bao nhiêu', 'price_query'],
            ['Kiểm tra đơn giá contactor', 'price_query'],
            ['Xem đơn giá sản phẩm này', 'price_query'],
            ['Báo giá đơn chiếc', 'price_query'],
            ['Đơn vị tính là gì', 'out_of_scope'],
            ['Contactor 1 pha đơn giản', 'product_search'],
            ['Tôi muốn đặt hàng sản phẩm này', 'product_search'],
            ['Chính sách hủy đơn thế nào', 'policy_query'],
            ['Chính sách giao hàng thế nào?', 'shipping_query'],
        ])('keeps %s as %s', (message, expected) => {
            expect(classifyChatIntent(message)).toBe(expected);
        });

        it('never looks up an order by a phone number the customer typed', () => {
            expect(classifyChatIntent('Cho mình đơn hàng của số điện thoại 0900000000')).toBe('human_handoff');
        });
    });
});
