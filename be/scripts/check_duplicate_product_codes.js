require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { resolveMongoUri } = require('../config/database');

function normalizeProductCodeForCompare(code) {
  return String(code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

async function main() {
  const uri = resolveMongoUri();
  console.log('Connecting to the configured database...');

  try {
    await mongoose.connect(uri);
    const dbName = mongoose.connection.name;
    console.log('Connected successfully. Querying for duplicate normalized product codes...');

    const products = await Product.find({
      code: { $exists: true, $nin: [null, ""] }
    }).select('_id name brand type code').lean();

    const groups = new Map();
    for (const product of products) {
      const normalizedCode = normalizeProductCodeForCompare(product.code);
      if (!normalizedCode) {
        continue;
      }
      if (!groups.has(normalizedCode)) {
        groups.set(normalizedCode, []);
      }
      groups.get(normalizedCode).push(product);
    }

    const duplicates = [...groups.entries()]
      .filter(([, docs]) => docs.length > 1)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    console.log(`Database: ${dbName}`);
    console.log(`Total products with code: ${products.length}`);
    console.log(`Duplicate normalized product code groups: ${duplicates.length}`);

    if (duplicates.length === 0) {
      console.log('No duplicate normalized product codes found.');
      return;
    }

    duplicates.forEach(([normalizedCode, docs], index) => {
      console.log(`\n#${index + 1} normalizedCode="${normalizedCode}" count=${docs.length}`);
      docs.forEach(doc => {
        console.log(`- _id=${doc._id} | code="${doc.code || ''}" | name="${doc.name || ''}" | brand="${doc.brand || ''}" | type="${doc.type || ''}"`);
      });
    });
  } catch (err) {
    console.error('Error during normalized duplicate code check:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database.');
  }
}

main();
