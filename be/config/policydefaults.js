const mongoose = require("mongoose");

const POLICY_KEYS = ["purchase", "warranty", "shipping", "privacy"];
const DEFAULT_POLICIES = [
    {
        "key": "purchase",
        "title": "Chính sách mua hàng",
        "summary": "Quy định về thông tin, xác nhận và xử lý đơn hàng thiết bị, linh kiện và giải pháp kỹ thuật tại NOVA.",
        "sections": [
            {
                "title": "Điều kiện mua hàng",
                "content": "Khách hàng vui lòng cung cấp đầy đủ thông tin liên hệ và địa chỉ nhận hàng. Với sản phẩm cần tư vấn cấu hình hoặc hiển thị trạng thái liên hệ, NOVA sẽ trao đổi lại trước khi xác nhận đơn."
            },
            {
                "title": "Quy trình đặt hàng",
                "content": "Chọn sản phẩm → Thêm vào giỏ hàng → Kiểm tra số lượng → Điền thông tin nhận hàng → Gửi đơn hàng. NOVA sẽ liên hệ khi cần xác nhận thêm về cấu hình, tồn kho hoặc thời gian giao."
            },
            {
                "title": "Giá bán và tình trạng hàng hóa",
                "content": "Giá, số lượng tồn và thời gian đáp ứng được ghi nhận theo thông tin của đơn hàng. Thiết bị đặt theo cấu hình, hàng dự án hoặc sản phẩm cần báo giá riêng sẽ được xác nhận trước khi thực hiện."
            },
            {
                "title": "Kiểm tra khi nhận hàng",
                "content": "Khách hàng nên kiểm tra tên sản phẩm, model, số lượng, tình trạng bao bì và phụ kiện ngay khi nhận. Nếu có sai lệch, vui lòng lưu lại hình ảnh và liên hệ NOVA để được hỗ trợ."
            },
            {
                "title": "Thay đổi hoặc hủy đơn",
                "content": "Yêu cầu thay đổi hoặc hủy đơn nên được gửi sớm qua hotline hoặc email. Khả năng xử lý phụ thuộc vào trạng thái đơn và đặc điểm sản phẩm, đặc biệt với hàng đặt riêng hoặc đã giao cho đơn vị vận chuyển."
            }
        ],
        "updatedAt": new Date("2026-07-22T00:00:00.000Z")
    },
    {
        "key": "warranty",
        "title": "Bảo hành & đổi trả",
        "summary": "Thông tin tiếp nhận bảo hành, kiểm tra kỹ thuật và xử lý đổi trả đối với sản phẩm do NOVA cung cấp.",
        "sections": [
            {
                "title": "Phạm vi bảo hành",
                "content": "Thời hạn và phạm vi bảo hành áp dụng theo thông tin của từng sản phẩm, nhà sản xuất hoặc thỏa thuận trên đơn hàng. Một số thiết bị công nghiệp cần kiểm tra kỹ thuật trước khi xác định phương án xử lý."
            },
            {
                "title": "Điều kiện tiếp nhận",
                "content": "Sản phẩm cần có thông tin đơn hàng hoặc chứng từ phù hợp; tem, serial và hiện trạng không bị thay đổi bất thường. Khách hàng nên mô tả lỗi và cung cấp hình ảnh hoặc video để hỗ trợ kiểm tra."
            },
            {
                "title": "Quy trình yêu cầu bảo hành",
                "content": "Liên hệ NOVA → Cung cấp mã đơn hàng và tình trạng sản phẩm → Nhận hướng dẫn gửi hoặc bàn giao thiết bị → NOVA kiểm tra và thông báo phương án xử lý."
            },
            {
                "title": "Đổi trả sản phẩm",
                "content": "NOVA tiếp nhận yêu cầu khi sản phẩm giao sai, thiếu, hư hỏng trong quá trình giao nhận hoặc có vấn đề kỹ thuật cần xác minh. Phương án đổi, sửa chữa hoặc hoàn trả được thống nhất sau khi kiểm tra."
            },
            {
                "title": "Trường hợp ngoài phạm vi",
                "content": "Hư hỏng do lắp đặt hoặc sử dụng sai hướng dẫn, tự ý sửa chữa, tác động cơ học, nguồn điện không phù hợp, môi trường bất thường hoặc hao mòn tự nhiên có thể không thuộc bảo hành miễn phí."
            }
        ],
        "updatedAt": new Date("2026-07-22T00:00:00.000Z")
    },
    {
        "key": "shipping",
        "title": "Vận chuyển & giao nhận",
        "summary": "Nguyên tắc giao hàng, chi phí vận chuyển và kiểm tra thiết bị khi nhận hàng từ NOVA.",
        "sections": [
            {
                "title": "Phạm vi giao hàng",
                "content": "NOVA hỗ trợ giao hàng tới các địa chỉ phù hợp tại Việt Nam. Phương thức vận chuyển được lựa chọn theo kích thước, khối lượng, tính chất kỹ thuật của sản phẩm và địa điểm nhận hàng."
            },
            {
                "title": "Phí và thời gian vận chuyển",
                "content": "Phí vận chuyển và thời gian dự kiến được hiển thị hoặc xác nhận khi xử lý đơn. Thiết bị cồng kềnh, hàng dự án, hàng đặt riêng hoặc địa chỉ ngoài khu vực thông thường có thể cần báo phí riêng."
            },
            {
                "title": "Bàn giao và kiểm tra",
                "content": "Người nhận vui lòng kiểm tra số kiện, model, số lượng và tình trạng bên ngoài trước khi xác nhận bàn giao. Nếu kiện hàng móp, rách, ướt hoặc sai thông tin, hãy chụp ảnh và liên hệ NOVA."
            },
            {
                "title": "Lắp đặt và vận hành",
                "content": "Dịch vụ vận chuyển không mặc nhiên bao gồm lắp đặt, đấu nối hoặc hướng dẫn vận hành tại công trình. Các hạng mục kỹ thuật được thực hiện theo đơn hàng, báo giá hoặc thỏa thuận riêng."
            },
            {
                "title": "Chậm giao ngoài dự kiến",
                "content": "Thời gian giao có thể thay đổi do giao thông, thời tiết, lịch vận chuyển, hàng đặt theo cấu hình hoặc sự kiện ngoài khả năng kiểm soát. NOVA sẽ cập nhật khi có thông tin thay đổi."
            }
        ],
        "updatedAt": new Date("2026-07-22T00:00:00.000Z")
    },
    {
        "key": "privacy",
        "title": "Chính sách bảo mật",
        "summary": "Cách NOVA tiếp nhận, sử dụng và bảo vệ thông tin phát sinh trong quá trình tư vấn, mua hàng và hỗ trợ kỹ thuật.",
        "sections": [
            {
                "title": "Thông tin được thu thập",
                "content": "NOVA có thể tiếp nhận họ tên, số điện thoại, email, địa chỉ giao hàng, thông tin đơn hàng và nội dung trao đổi hỗ trợ do khách hàng chủ động cung cấp khi sử dụng website."
            },
            {
                "title": "Mục đích sử dụng",
                "content": "Thông tin được sử dụng để xác nhận và giao đơn hàng, hỗ trợ kỹ thuật, bảo hành, phản hồi yêu cầu, quản lý tài khoản và cải thiện chất lượng sản phẩm hoặc dịch vụ."
            },
            {
                "title": "Chia sẻ thông tin",
                "content": "NOVA chỉ chia sẻ thông tin cần thiết với bộ phận phụ trách, đơn vị vận chuyển, đối tác kỹ thuật hoặc cơ quan có thẩm quyền khi cần phục vụ giao dịch và yêu cầu hợp pháp."
            },
            {
                "title": "Lưu trữ và bảo vệ",
                "content": "Thông tin được lưu trữ trong thời gian phù hợp với mục đích xử lý đơn hàng, hỗ trợ khách hàng và nghĩa vụ quản lý liên quan. NOVA áp dụng biện pháp hợp lý để hạn chế truy cập trái phép."
            },
            {
                "title": "Quyền của khách hàng",
                "content": "Khách hàng có thể liên hệ để đề nghị kiểm tra, cập nhật hoặc trao đổi về việc xử lý thông tin cá nhân. NOVA sẽ xem xét trên cơ sở xác minh người gửi và nghĩa vụ lưu trữ liên quan."
            }
        ],
        "updatedAt": new Date("2026-07-22T00:00:00.000Z")
    }
];

const policySectionSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 150 },
    content: { type: String, required: true, trim: true, maxlength: 5000 }
}, { _id: false });

const storefrontPolicySchema = new mongoose.Schema({
    key: { type: String, required: true, enum: POLICY_KEYS },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    summary: { type: String, default: '', trim: true, maxlength: 500 },
    sections: { type: [policySectionSchema], default: [] },
    updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const clonePolicy = (policy) => ({
    key: policy.key,
    title: policy.title,
    summary: policy.summary || '',
    sections: (policy.sections || []).map((section) => ({ ...section })),
    updatedAt: new Date(policy.updatedAt || Date.now())
});

const createDefaultPolicies = () => DEFAULT_POLICIES.map(clonePolicy);

const normalizePolicy = (policy) => {
    const key = typeof policy?.key === 'string' ? policy.key.trim() : '';
    const title = typeof policy?.title === 'string' ? policy.title.trim() : '';
    const summary = typeof policy?.summary === 'string' ? policy.summary.trim() : '';
    if (!POLICY_KEYS.includes(key)) return { error: 'M? ch?nh s?ch kh?ng h?p l? ho?c b? tr?ng' };
    if (!title || title.length > 150) return { error: `Ti?u ?? ch?nh s?ch ${key} kh?ng h?p l?` };
    if (summary.length > 500) return { error: `M? t? ch?nh s?ch ${key} kh?ng ???c v??t qu? 500 k? t?` };
    if (!Array.isArray(policy?.sections) || policy.sections.length === 0 || policy.sections.length > 20) {
        return { error: `Ch?nh s?ch ${key} ph?i c? t? 1 ??n 20 n?i dung` };
    }
    const sections = [];
    for (const section of policy.sections) {
        const sectionTitle = typeof section?.title === 'string' ? section.title.trim() : '';
        const sectionContent = typeof section?.content === 'string' ? section.content.trim() : '';
        if (!sectionTitle || sectionTitle.length > 150 || !sectionContent || sectionContent.length > 5000) {
            return { error: `N?i dung trong ch?nh s?ch ${key} kh?ng h?p l?` };
        }
        sections.push({ title: sectionTitle, content: sectionContent });
    }
    return { policy: { key, title, summary, sections } };
};

const normalizePoliciesPayload = (policies) => {
    if (!Array.isArray(policies) || policies.length !== POLICY_KEYS.length) {
        return { error: `Danh s?ch ch?nh s?ch ph?i c? ?? ${POLICY_KEYS.length} m?c` };
    }
    const seenKeys = new Set();
    const normalizedPolicies = [];
    for (const policy of policies) {
        const normalized = normalizePolicy(policy);
        if (normalized.error || seenKeys.has(normalized.policy.key)) {
            return { error: normalized.error || 'M? ch?nh s?ch kh?ng h?p l? ho?c b? tr?ng' };
        }
        seenKeys.add(normalized.policy.key);
        normalizedPolicies.push(normalized.policy);
    }
    return { policies: POLICY_KEYS.map((key) => normalizedPolicies.find((policy) => policy.key === key)) };
};

const policyComparableValue = (policy) => JSON.stringify({
    key: policy.key,
    title: policy.title,
    summary: policy.summary || '',
    sections: policy.sections || []
});

module.exports = {
    DEFAULT_POLICIES,
    POLICY_KEYS,
    createDefaultPolicies,
    normalizePoliciesPayload,
    policyComparableValue,
    storefrontPolicySchema,
};
