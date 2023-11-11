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
    
    // Get all people with their reference data.
    const personRecords = await photos.getPersonRecords();

    // Get a count and walk through the files one by one.
    const fileCount = await photos.getCount();

    for (let i = 0; i < fileCount; i++) {
        // Collect the data (fileInfo and faceData records) for this file.
        const fileData = await photos.getDataForFileWithIndex(i);        
        const filePath = fileData.fileInfo?.fullname;

        if (!filePath) {
            log(`Error: Could not find record for file with index ${i}.`, 'red');
            continue;
        }

        let faceDataRecordId = fileData.faceData?._id?.toString();

        
        log(`-- #${i} (${filePath}), fileInfo #${fileData.fileInfo._id}, faceData #${faceDataRecordId ? faceDataRecordId : `n/a`}. --`, 'green');
        
        if (!faceDataRecordId) {
            log(`No faceData for ${filePath}; running face detection.`, 'yellow');
            fileData.faceData = await photos.processFaces(filePath); 
            faceDataRecordId = fileData.faceData._id.toString();           
        }

        const detectedFaces = fileData.faceData.faceData?.length;

        if (!detectedFaces) {
            log(`No detected faces in ${filePath}.`, 'gray');
            continue;
        }

        // We have faceData, and at least one detected face. Run the recognition.
        await photos.recognizeFacesInFile(fileData, personRecords);

        const matchInfo = fileData.matchInfo;
        const matches = matchInfo?.matches;
        
        if (!Array.isArray(matches)) {
            log(`Error: matchInfo returned from photos.recognizeFacesInFile should be an array. This is unexpected.`, 'red');
            continue;
        }

        if (faceDataRecordId !== matchInfo.faceDataRecordId.toString()) {
            log(`Error: FaceDataRecordIds for the file and the referenced faceDataRecord do not match. This is unexpected.`, 'red');
            continue;
        }

        if (!matches.length) {
            log(`None of ${detectedFaces} detected faces were recognized.`, 'green');
            continue;
        }

        const faceDataRecord = { ...fileData.faceData }; //await photos.getFaceDataRecord(faceDataRecordId);            
        let newlyMatchedFaces = 0;
        // Go through the matches and update the faceDataRecord where needed.
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];

            // Find the matched faceDataItem.
            const matchedFaceDataItem = faceDataRecord?.faceData.find(faceDataItem => faceDataItem.index === match.testFaceIndex);

            if (!matchedFaceDataItem) {
                log(`Warning: FaceDataItem at index ${match.testFaceIndex} not found. This is unexpected.`, 'yellow');
                continue;
            }

            // Compare to see if we recognized someone previously unrecognized, and if so whether we're overwriting someone.
            const existingPersonRecordId = matchedFaceDataItem.personRecordId?.toString();
            const recognizedPersonRecordId = match.personRecordId?.toString();

            if (existingPersonRecordId) {
                if (existingPersonRecordId !== recognizedPersonRecordId) {
                    log(`Warning: Overwriting previously recognized person ${match.personRecordId} at faceDataItemIndex ${match.testFaceIndex}`, 'yellow');
                } else {
                    // Nothing to do - this person was already recognized.
                    continue;
                }                
            }
            
            // Mark the item on the faceDataRecord with the newly recognized personId.
            matchedFaceDataItem.personRecordId = match.personRecordId;
            newlyMatchedFaces++;            
        };

        if (!newlyMatchedFaces) {
            log(`${matches.length} of ${detectedFaces} face(s) were previously recognized, no new matches found; ${detectedFaces - matches.length} unknown face(s) remaining.`, 'gray');
            continue;
        }

        log(`${matches.length - newlyMatchedFaces} of ${detectedFaces} face(s) were previously recognized, ${newlyMatchedFaces} new matches found; ${detectedFaces - matches.length} unknown face(s) remaining.`, 'green');

        await photos.updateFaceDataRecord(faceDataRecord);            
        log(`Sucessfully updated faceDataRecord with id ${faceDataRecordId} with personRecordIDs for ${newlyMatchedFaces} newly matched face(s).`);

    }
}).catch(err => {
    log(`Unable to connect to database. Exiting.`, null, err);
});

