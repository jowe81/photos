/**
 * This is to change the label of the collection 'favorites' to "Johannes' Faves"
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

        const docs = await collection.find({}).toArray();
        console.log("Have ", docs.length, " docs");

        let selectedDocs = 0,
            skippedDocs = 0;
        const promises = docs.map(function (doc) {            
            if (doc.collections?.includes("favorites")) {
                selectedDocs++;

                // Add the new favorites collection if it's not present yet
                if (!doc.collections.includes("Johannes' Faves")) {
                    doc.collections.push("Johannes' Faves");
                }

                // Remove the old favorites collection
                doc.collections = doc.collections.filter(collection => collection !== 'favorites');

                return collection.updateOne({ _id: doc._id }, { $set: { collections: doc.collections } });
            } else {
                skippedDocs++;
                return Promise.resolve();
            }
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
