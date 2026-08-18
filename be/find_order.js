
const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect('mongodb://localhost:27017/test');
    console.log('Connected to DB: test');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections in DB test:", collections.map(c => c.name));
    
    let foundDoc = null;
    let foundCollection = '';

    for (const col of collections) {
        try {
            const doc = await mongoose.connection.db.collection(col.name).findOne({
                _id: new mongoose.Types.ObjectId('6a4731ea1ffc0ed00c5882d7')
            });
            if (doc) {
                foundDoc = doc;
                foundCollection = col.name;
                break;
            }
        } catch (e) {}
    }

    if (!foundDoc) {
        await mongoose.disconnect();
        await mongoose.connect('mongodb://localhost:27017/Ecom');
        console.log('Connected to DB: Ecom');
        
        const EcomCollections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections in DB Ecom:", EcomCollections.map(c => c.name));
        
        for (const col of EcomCollections) {
            try {
                const doc = await mongoose.connection.db.collection(col.name).findOne({
                    _id: new mongoose.Types.ObjectId('6a4731ea1ffc0ed00c5882d7')
                });
                if (doc) {
                    foundDoc = doc;
                    foundCollection = col.name;
                    break;
                }
            } catch (e) {}
        }
    }

    if (foundDoc) {
        console.log(`Tìm thấy trong collection: "${foundCollection}"`);
        console.log(JSON.stringify(foundDoc, null, 2));
    } else {
        console.log('Không tìm thấy tài liệu nào có ID này trong toàn bộ DB.');
    }

    await mongoose.disconnect();
}

run().catch(console.error);
