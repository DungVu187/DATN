const fs = require('fs');
const path = require('path');
const assetsDir = path.join(__dirname, '..', '..', 'ad', 'dist', 'assets');
const bundleName = fs.readdirSync(assetsDir).find((name) => /^index-.*\.js$/.test(name));
if (!bundleName) throw new Error('Admin bundle not found. Run the admin build first.');
const content = fs.readFileSync(path.join(assetsDir, bundleName), 'utf8');
const count = (content.match(/superadmin/gi) || []).length;
console.log(`Word "superadmin" count (case-insensitive): ${count}`);
if (count > 0) {
  // Let's print some context around the match
  const idx = content.indexOf('superadmin');
  console.log('Context:', content.substring(Math.max(0, idx - 100), Math.min(content.length, idx + 100)));
}
process.exit(0);
