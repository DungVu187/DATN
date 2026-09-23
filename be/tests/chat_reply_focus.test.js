const { buildProductEvidence, renderEvidenceSelection, buildAdviceReply } = require('../services/chatReplyTemplates');

const products = Array.from({ length: 5 }, (_, index) => ({
    productId: String(index), name: 'Thiết bị ' + index, code: 'DEMO-' + index,
    type: 'PLC', brand: 'Siemens', specifications: '24VDC', availability: 'available',
    variants: [{ price: '100000', canBuyDirectly: true }],
}));
const evidence = buildProductEvidence(products, { requestedTypes: ['PLC'], requestedBrands: ['Siemens'] });
const selection = {
    answerType: 'advice', productIds: products.map((product) => product.productId),
    factIds: evidence.facts.map((fact) => fact.id), reasonIds: evidence.reasons.map((reason) => reason.id),
};

test('advice does not repeat identity or unsolicited commercial facts', () => {
    const reply = renderEvidenceSelection(selection, evidence);
    expect(reply).not.toMatch(/đúng nhóm|đúng hãng|thuộc nhóm|Giá của|còn hàng/);
    expect(reply.match(/DEMO-0/g)).toHaveLength(1);
    expect(reply).toContain('24VDC');
    expect(reply).not.toContain('DEMO-3');
});

test('specific question only renders requested fields', () => {
    const reply = renderEvidenceSelection(selection, evidence, { requestedFields: ['price'] });
    expect(reply).toContain('100.000');
    expect(reply).not.toMatch(/24VDC|Thông số:|thuộc nhóm/);
});

test('clarification does not append candidate lists', () => {
    const reply = renderEvidenceSelection({ ...selection, answerType: 'clarification', questionKey: 'need_budget' }, evidence);
    expect(reply).toContain('ngân sách');
    expect(reply).not.toContain('DEMO-');
});

test('fallback omits group brand price and stock boilerplate', () => {
    const reply = buildAdviceReply(products);
    expect(reply).not.toMatch(/thuộc nhóm|hãng Siemens|100.000|còn hàng|phù hợp nhất/);
    expect(reply).toContain('24VDC');
    expect(reply).not.toContain('DEMO-3');
});
