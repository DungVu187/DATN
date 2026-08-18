const mongoose = require('mongoose');

async function list() {
  const uri = 'mongodb://localhost:27017/';
  try {
    const conn = await mongoose.createConnection(uri).asPromise();
    const admin = conn.db.admin();
    const dbs = await admin.listDatabases();
    console.log('Databases in MongoDB:');
    for (const db of dbs.databases) {
      console.log(`- ${db.name} (${db.sizeOnDisk} bytes)`);
      const dbConn = mongoose.createConnection(`${uri}${db.name}`);
      await dbConn.asPromise();
      const collections = await dbConn.db.listCollections().toArray();
      console.log(`   Collections: ${collections.map(c => c.name).join(', ')}`);
      await dbConn.close();
    }
    await conn.close();
  } catch (e) {
    console.error('Error listing DBs:', e.message);
  }
  process.exit(0);
}

list();
