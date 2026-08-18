const mongoose = require('mongoose');

async function check() {
  const dbs = ['Ecom', 'test'];
  for (const dbName of dbs) {
    const dbUri = `mongodb://localhost:27017/${dbName}`;
    console.log(`Checking DB: ${dbName}`);
    try {
      const conn = await mongoose.createConnection(dbUri).asPromise();
      const userSchema = new mongoose.Schema({ phone: String, role: String, name: String });
      const UserModel = conn.model('User', userSchema);
      const user = await UserModel.findOne({ phone: '0813158383' });
      if (user) {
        console.log(`  -> Found in ${dbName}: Phone: ${user.phone}, Role: ${user.role}`);
      } else {
        console.log(`  -> Not found in ${dbName}`);
      }
      await conn.close();
    } catch (e) {
      console.error(`Error checking ${dbName}:`, e.message);
    }
  }
  process.exit(0);
}

check();
