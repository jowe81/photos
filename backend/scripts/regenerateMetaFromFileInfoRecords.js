/**
 * This is to regenerate the data in the photosDbMeta and photosDbMetaItems collections from the fileInfo records.
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
    const dbHandle = await mongoConnect('dynforms');
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

// MongoDB database configuration
const mongoConfig = {
    url: "mongodb://server.wnet.wn:27017",
    dbName: "dynforms",
    collectionName: "photosFileInfo",
};

async function seedMetaCollectionFromMetaItemsArray(metaTypeFieldName, metaTypeLabel) {
    const now = new Date();
    const itemNames = await photos.getArrayItems(metaTypeFieldName);
    const promises = itemNames.map(async (itemName) => {
        let result = await metaCollection.insertOne({
            type: metaTypeLabel,
            name: itemName,
            created_at: now,
            updated_at: now,
        });
        log(`Added ${metaTypeLabel} ${itemName}, ${result.insertedId}`);

        result = await seedMetaItemsCollection(metaTypeFieldName, itemName, result.insertedId, metaTypeLabel);
    });

    return await Promise.all(promises);
}

async function seedMetaItemsCollection(metaTypeFieldName, metaItemName, metaItemId, metaTypeLabel) {
    /**
     * Pull all fileInfo records that contain metaItemName in record[metaTypeFieldName]
     */

    let matchingFileInfoRecords;
    
    if (["tags", "collections"].includes(metaTypeFieldName)) {
        matchingFileInfoRecords = await fileInfoCollection
            .find({ [metaTypeFieldName]: { $in: [metaItemName] } })
            .toArray();
    } else {
        // Folders
        matchingFileInfoRecords = await fileInfoCollection
            .find({ [metaTypeFieldName]: metaItemName })
            .toArray();
    }

    const now = new Date();

    let addedItemsCount = 0;

    const promises = matchingFileInfoRecords.map(async (fileInfoRecord) => {
        let result = await metaItemsCollection.insertOne({
            fileInfoId: fileInfoRecord._id,
            metaTypeItemId: metaItemId,
            metaItemName,
            metaTypeLabel,
            created_at: now,
            updated_at: now,
        });
        addedItemsCount++;

        return addedItemsCount;
    });

    await Promise.all(promises);
    log(`Added ${addedItemsCount} records for ${metaTypeLabel} ${metaItemName}`, 'green');
}

// Main function to execute the data migration
async function migrateData() {
    try {
        const now = new Date();
        await metaCollection.deleteMany({});
        log(`Cleared the meta collection.`, 'yellow');
        await metaItemsCollection.deleteMany({});
        log(`Cleared the meta items collection.`, "yellow");

        log(`Migrating collections, tags and folders...`, "yellow");
        await seedMetaCollectionFromMetaItemsArray("collections", "collection");
        await seedMetaCollectionFromMetaItemsArray("tags", "tag");
        await seedMetaCollectionFromMetaItemsArray("dirname", "folder");
        log(`Done migrating collections, tags and folders.`, 'green');



        await client.close();
        log(`Done.`, 'green');
        process.exit();
    } catch (error) {
        console.error("Error during data migration:", error);
    }
}

// Execute the migration process
migrateData();
