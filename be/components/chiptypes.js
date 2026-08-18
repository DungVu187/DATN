const express = require('express');
const { authenticateAdmin, checkPermission } = require('../middlewares/auth');
const {
    createChipType,
    deleteChipType,
    getChipTypes,
} = require('../controllers/chipTypeOperations');

const router = express.Router();

router.get('/', getChipTypes);
router.post('/', authenticateAdmin, checkPermission('product.create'), createChipType);
router.delete('/:id', authenticateAdmin, checkPermission('product.create'), deleteChipType);

module.exports = {
    router,
};
