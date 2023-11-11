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
            log(`No faceData for ${fileData.fileInfo?.fullname}.`, 'yellow');
            continue;
        }

        log(`Running recognition for faceDataRecordId ${fileData.faceData._id} (${fileData.fileInfo?.fullname})`, 'cyan');
        
        await photos.recognizeFacesInFile(fileData, personRecords);

        const matchInfo = fileData.matchInfo;
        const matches = matchInfo?.matches;
        const faceDataRecordId = matchInfo?.faceDataRecordId;
        
        if (!Array.isArray(matches)) {
            continue;
        }

        if (!matches.length) {
            log(`No faces recognized.`, 'cyan');
            continue;
        }

        log(`Recognized ${matches.length} of ${fileData.faceData.faceData.length} faces.`, 'green');

        
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            // Find the faceDataRecord and the matched faceDataItem.
            const faceDataRecord = await photos.getFaceDataRecord(faceDataRecordId);            
            const matchedFaceDataItem = faceDataRecord?.faceData.find(faceDataItem => faceDataItem.index === match.testFaceIndex);

            if (!matchedFaceDataItem) {
                log(`Warning: FaceDataItem at index ${match.testFaceIndex} not found. This is unexpected.`, 'yellow');
                continue;
            }

            // Compare to see if we recognized someone previously unrecognized, and if so whether we're overwriting someone.
            const existingPersonRecordId = matchedFaceDataItem.personRecordId.toString();
            const recognizedPersonRecordId = match.personRecordId.toString();

            if (existingPersonRecordId) {
                if (existingPersonRecordId !== recognizedPersonRecordId) {
                    log(`Warning: Overwriting previously recognized person ${match.personRecordId} at faceDataItemIndex ${match.testFaceIndex}`, 'yellow');
                } else {
                    // Nothing to do.
                    continue;
                }                
            }
            
            // Mark the item on the faceDataRecord with the newly recognized personId.
            matchedFaceDataItem.personRecordId = match.personRecordId;

            await photos.updateFaceDataRecord(faceDataRecord);
            
            log(`Sucessfully updated faceDataRecord with id ${faceDataRecordId}`);
            
        };        
    }
}).catch(err => {
    log(`Unable to connect to database. Exiting.`, null, err);
});

