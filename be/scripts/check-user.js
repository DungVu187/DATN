require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/user');

const dbName = process.env.DB_NAME || 'Ecom';
const dbUri = `mongodb://localhost:27017/${dbName}`;

mongoose.connect(dbUri)
  .then(async () => {
    const user = await User.findOne({ phone: '0813158383' });
    if (user) {
      console.log('USER FOUND:');
      console.log(`Phone: ${user.phone}`);
      console.log(`Role: ${user.role}`);
      console.log(`Name: ${user.name}`);
      console.log(`Has password: ${!!user.password}`);
    } else {
      console.log('USER NOT FOUND!');
    }
    await mongoose.disconnect();
    process.exit(0);
  });
