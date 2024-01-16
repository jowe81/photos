import dotenv from "dotenv";

dotenv.config();

// Project files
import Photos from "./modules/photos/photos.js";
import { log } from "./helpers/jUtils.js";
import { clientContainer } from "./db/mongodb.js";
const mongoConnect = clientContainer.mongoConnect;

const appName = process.env.APP_NAME ?? "JJ Project Backend";
log(`Directory scan for ${appName} app starting.`);

const args = process.argv.slice(2);

if (!args.length) {
    log(`Argument missing: please pass a valid path to scan for photos.`);
    process.exit();
}

let db_mongo_database, db;
try {
    const dbHandle = await mongoConnect();
    db_mongo_database = dbHandle.db_mongo_database;
    db = dbHandle.db;
} catch (err) {
        log(`Unable to connect to database. Exiting.`, null, err);
}


log(`Connected to database ${db_mongo_database}`);

const photos = await Photos(db);
const path = args[0];

log(`Adding directory: ${path}`);
const start = Date.now();
await photos.addDirectoryToDb(path);

const seconds = (Date.now() - start) / 1000;

log(`Finished after ${Math.round(seconds/60)} minutes (${seconds} seconds).`)

await clientContainer.mongoClient.close();
log(`Disconnected from database.`);

process.exit();