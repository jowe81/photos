/**
 * Make sure the needed indexes are in place
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
async function handle() {
    try {
        const client = await getClient();
        const collection = await getCollection(client, mongoConfig.collectionName);
        collection.createIndex({collections: 1});
        collection.createIndex({tags: 1});
        collection.createIndex({dirname: 1});
        console.log(`Verified Indexes.`);
        
        await client.close();
        process.exit();
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

// Execute the migration process
handle();
