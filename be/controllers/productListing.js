const { ProductAccessError } = require('../services/productAccess');
const { listProducts } = require('../services/productListing');

async function getProducts(req, res) {
    try {
        const result = await listProducts({
            query: req.query,
            userId: req.user?.userId,
        });
        return res.json(result);
    } catch (error) {
        if (error instanceof ProductAccessError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error('Error fetching products:', error);
        return res.status(500).json({ message: 'Server error. Please try again later.' });
    }
}

module.exports = {
    getProducts,
};
