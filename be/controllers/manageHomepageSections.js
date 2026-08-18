const {
    updateHomepageSection: persistHomepageSection,
    updateLegacyHomepageSection,
} = require('../services/manageHomepageSections');

async function updateHomepageSection(req, res) {
    try {
        const result = await persistHomepageSection(req.params.sectionId, req.body);
        if (result.error) {
            return res.status(400).json({ success: 0, message: result.error });
        }

        res.json({
            success: 1,
            message: `Cập nhật ${result.sectionId} thành công`,
            data: result.updatedManage
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: 0,
            message: 'Lỗi server khi cập nhật section',
            error: 'Lỗi server'
        });
    }
}

const createLegacySectionHandler = (sectionNumber) => async (req, res) => {
    const sectionId = `section${sectionNumber}`;
    try {
        const result = await updateLegacyHomepageSection(sectionNumber, req.body);
        if (result.error) {
            return res.status(400).json({ success: 0, message: result.error });
        }

        res.json({
            success: 1,
            message: `Cập nhật ${sectionId} thành công`,
            data: result.updatedManage
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: 0,
            message: `Lỗi server khi cập nhật ${sectionId}`,
            error: 'Lỗi server'
        });
    }
};

const legacySectionHandlers = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => {
        const sectionNumber = index + 1;
        return [`section${sectionNumber}`, createLegacySectionHandler(sectionNumber)];
    })
);

module.exports = {
    legacySectionHandlers,
    updateHomepageSection,
};
