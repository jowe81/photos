import dotenv from 'dotenv';

dotenv.config();

// Project files
import mongoConnect from './db/mongodb.js';
import Photos from './modules/photos/photos.js';
import { log } from './helpers/jUtils.js';

const appName = process.env.APP_NAME ?? "JJ Project Backend";
log(`Face recognition for ${appName} app starting.`);

mongoConnect().then(async ({db_mongo_database, db}) => {
    log(`Connected to database ${db_mongo_database}`);

    const photos = await Photos(db);
    

    const personRecords = await photos.getPersonRecords();

    const fileCount = await photos.getCount();

    for (let i = 0; i < fileCount; i++) {
        const fileData = await photos.getDataForFileWithIndex(i);

        if (!fileData?.faceData) {
            log(`No faceData for ${fileData.fileInfo?.fullname}`);
            continue;
        }

        log(`Running face matching for ${fileData.fileInfo?.fullname}`);
        const result = await photos.recognizeFacesInFile(fileData, personRecords);
        console.log(`Result:`, result);
    }
}).catch(err => {
    log(`Unable to connect to database. Exiting.`, null, err);
});

