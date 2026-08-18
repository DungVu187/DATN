function normalizeProductCodeForCompare(code) {
    return String(code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

module.exports = {
    normalizeProductCodeForCompare,
};
