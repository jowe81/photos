/**
 * This is to (re-)calculate an md5 fingerprint for each fileInfo record
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


// Main function to execute the data migration
async function migrateData() {
    try {
        const docs = await fileInfoCollection.find({}).limit(0).toArray();
        log(`Have ${docs.length} records`, 'green');
        let failed = 0;
        let generated = 0;
        const promises = docs.map(async(doc, index) => {  
            const percent = Math.round(index / docs.length * 100);
            if (doc.fingerPrint) {
                // Already done with this one
                log(`(${percent}%) ${doc.fullname}: ${doc.fingerPrint} (existed)`);
                return Promise.resolve(doc.fingerPrint)
            }

            // Need to calculate the md5 and update the record.
            try {
                const fingerPrint = await photos.getFingerPrint(doc.fullname);
                doc.fingerPrint = fingerPrint;
                await fileInfoCollection.updateOne({_id: doc._id}, doc);
                log(`(${percent}%) ${doc.fullname}: ${doc.fingerPrint} (new)`);       
                generated++;         
                return fingerPrint;
            } catch (err) {
                log(`(${percent}%) ${doc.fullname}: Could not process file.`, "bgRed");
                failed++
            }
        });

        const fingerPrints = await Promise.all(promises);
        log(`Successfully processed ${docs.length - failed} fingerprints. Newly generated ${generated}, failed to process ${failed}.`, 'yellow');
        await client.close();
        log(`Done.`, 'green');
        process.exit();
    } catch (error) {
        console.error("Error during data migration:", error);
    }
}

// Execute the migration process
migrateData();
