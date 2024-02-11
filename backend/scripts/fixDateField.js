/**
 * This is to fix a the date field from containing a string to contain ISODate
 **/

import { MongoClient  } from "mongodb";

// MongoDB database configuration
const mongoConfig = {
    url: "mongodb://server.wnet.wn:27017",
    dbName: "dynforms",
    collectionName: "photosFileInfo",
};

async function getClient() {
    const client = new MongoClient(mongoConfig.url, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    await client.connect();

    return client;
}


async function getCollection(client, collectionName) {
    const database = client.db(mongoConfig.dbName);
    return database.collection(collectionName);
}

// Main function to execute the data migration
async function migrateData() {
    try {
        const client = await getClient();
        const collection = await getCollection(client, mongoConfig.collectionName);

        const docs = await collection.find({}).toArray();
        console.log('Have ' , docs.length, ' docs');

        let selectedDocs = 0, skippedDocs = 0;
        const promises = docs.map(function (doc) {
            if (typeof doc.date === 'string') {
                selectedDocs++;
                return collection.updateOne(
                    { _id: doc._id },
                    { $set: { date: new Date(doc.date) }, $unset: { _date: 1 } }
                );
            } else {
                skippedDocs++;
                return Promise.resolve();
            }
        });                

        console.log('Have ', promises.length, ' promises.', `Selected ${selectedDocs} records, skipped ${skippedDocs}.`);
        
        await Promise.all(promises);
        await client.close();
        process.exit();
    } catch (error) {
        console.error("Error during data migration:", error);
    }
}

// Execute the migration process
migrateData();
