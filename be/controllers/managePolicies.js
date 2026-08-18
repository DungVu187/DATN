const { Manage } = require('../models/manage');
const {
    POLICY_KEYS,
    createDefaultPolicies,
    ensurePolicyTranslations,
    normalizePoliciesPayload,
    policyComparableValue,
} = require('../config/policydefaults');

async function getPolicies(req, res) {
    try {
        const manageData = await Manage.findOne().lean();
        const policies = manageData?.policies?.length === POLICY_KEYS.length
            ? manageData.policies
            : createDefaultPolicies();

        res.json({ success: 1, data: policies.map(ensurePolicyTranslations) });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: 0,
            message: 'Lỗi server khi lấy danh sách chính sách',
            error: 'Lỗi server'
        });
    }
}

async function updateMainPolicy(req, res) {
    try {
        const { mainPolicy } = req.body;

        if (typeof mainPolicy !== 'string') {
            return res.status(400).json({
                success: 0,
                message: 'Vui lòng cung cấp giá trị hợp lệ cho mainPolicy'
            });
        }

        const manage = await Manage.findOne();
        const updatedManage = manage
            ? await Manage.findOneAndUpdate(
                {},
                { $set: { mainPolicy } },
                { new: true }
            )
            : await new Manage({ mainPolicy }).save();

        res.json({
            success: 1,
            message: 'Cập nhật mainPolicy thành công',
            data: updatedManage
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: 0,
            message: 'Lỗi server khi cập nhật mainPolicy',
            error: 'Lỗi server'
        });
    }
}

async function updatePolicies(req, res) {
    try {
        const normalized = normalizePoliciesPayload(req.body?.policies);
        if (normalized.error) {
            return res.status(400).json({ success: 0, message: normalized.error });
        }

        const manage = await Manage.findOne();
        const currentPolicies = manage?.policies?.length === POLICY_KEYS.length
            ? manage.policies.map(ensurePolicyTranslations)
            : createDefaultPolicies();
        const updatedAt = new Date();
        const policies = normalized.policies.map((policy) => {
            const currentPolicy = currentPolicies.find((item) => item.key === policy.key);
            const unchanged = currentPolicy
                && policyComparableValue(currentPolicy) === policyComparableValue(policy);

            return {
                ...policy,
                updatedAt: unchanged && currentPolicy.updatedAt ? currentPolicy.updatedAt : updatedAt
            };
        });

        const updatedManage = manage
            ? await Manage.findOneAndUpdate({}, { $set: { policies } }, { new: true, runValidators: true })
            : await new Manage({ policies }).save();

        res.json({
            success: 1,
            message: 'Cập nhật chính sách thành công',
            data: updatedManage.policies
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: 0,
            message: 'Lỗi server khi cập nhật chính sách',
            error: 'Lỗi server'
        });
    }
}

module.exports = {
    getPolicies,
    updateMainPolicy,
    updatePolicies,
};
