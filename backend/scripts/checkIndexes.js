/**
 * Make sure the needed indexes are in place
 **/

import dotenv from "dotenv";
dotenv.config();

import { MongoClient } from "mongodb";
import Photos from "./../modules/photos/photos.js";
import { getEnhancedCollection } from "./../db/dbutils.js";
import { log } from "./../helpers/jUtils.js";

import { clientContainer } from "./../db/mongodb.js";
const mongoConnect = clientContainer.mongoConnect;
let client;

let db_mongo_database, db;
try {
    const dbHandle = await mongoConnect("dynforms");
    db_mongo_database = dbHandle.db_mongo_database;
    db = dbHandle.db;
    client = dbHandle.client;
} catch (err) {
    log(`Unable to connect to database. Exiting.`, null, err);
}

log(`Connected to database ${db_mongo_database}`);

const collectionBaseName = "photos";
const collectionNameFileInfo = `${collectionBaseName}FileInfo`;
const collectionNameDbMeta = `${collectionBaseName}DbMeta`;
const collectionNameDbMetaItems = `${collectionBaseName}DbMetaItems`;

const fileInfoCollection = getEnhancedCollection(db, collectionNameFileInfo);
const metaCollection = getEnhancedCollection(db, collectionNameDbMeta);
const metaItemsCollection = getEnhancedCollection(db, collectionNameDbMetaItems);

const photos = await Photos(db);

// Main function to execute the data migration
async function handle() {
    try {
        log(`Verifying Indexes for ${collectionNameFileInfo}.`, 'yellow');
        await fileInfoCollection.createIndex({ collections: 1 });
        await fileInfoCollection.createIndex({ tags: 1 });
        await fileInfoCollection.createIndex({ dirname: 1 });
        await fileInfoCollection.createIndex({ fullname: 1 });

        log(`Verifying Indexes for ${collectionNameDbMeta}.`, "yellow");
        await metaItemsCollection.createIndex({ type: 1 });
        await metaItemsCollection.createIndex({ type: 1, value: 1 });
        
        log(`Verifying Indexes for ${collectionNameDbMetaItems}.`, "yellow");
        await metaItemsCollection.createIndex({ metaTypeItemId: 1 });

        log(`Done`,'green')
        await client.close();
        process.exit();
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

// Execute the migration process
handle();
