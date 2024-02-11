/**
 * This is to put pictures that are in a collection other than trashed into the general collection
 **/

import { MongoClient } from "mongodb";

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

        // Get all pics that are not in the trash and that are in some collection.
        const docs = await collection.find({$and: [ {collections: { $ne: ['trashed'] }} , { collections: { $exists: true, $not: {$size: 0} } } ]}).toArray();
        console.log("Have ", docs.length, " docs");

        let selectedDocs = 0,
            skippedDocs = 0;
        const promises = docs.map(function (doc) {
            const collections = ['general', ...doc.collections];
            
            return collection.updateOne(
                { _id: doc._id },
                { $set: { collections } }
            );
        });

        console.log(
            "Have ",
            promises.length,
            " promises.",
            `Selected ${selectedDocs} records, skipped ${skippedDocs}.`
        );

        await Promise.all(promises);
        await client.close();
        process.exit();
    } catch (error) {
        console.error("Error during data migration:", error);
    }
}

// Execute the migration process
migrateData();
