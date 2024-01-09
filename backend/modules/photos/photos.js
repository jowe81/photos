import constants from "../../constants.js";
import chalk from "chalk";
import fs from "fs";
import ExifParser from "exif-parser";
import ExifReader from "exifreader";

import { ObjectId } from "mongodb";

import { scanDirectory } from "../scanner.js";
import { parsePath } from "../../helpers/jUtils.js";
import { getEnhancedCollection } from "../../db/dbutils.js";
import { getFaceFunctions } from "./faceRecognition.mjs";

import { log } from "./../Log.js";
import axios from "axios";

async function Photos(dbObject, collectionName) {
    const db = dbObject;

    if (!collectionName) {
        collectionName = constants.defaultCollectionName;
    }

    const collectionNameFileInfo = `${collectionName}FileInfo`;
    const collectionNameFaceData = `${collectionName}FaceData`;
    const collectionNamePeople = `${collectionName}People`;

    const fileInfoCollection = getEnhancedCollection(db, collectionNameFileInfo);
    const faceDataCollection = getEnhancedCollection(db, collectionNameFaceData);
    const peopleCollection = getEnhancedCollection(db, collectionNamePeople);



    const extensions = [".jpg", ".jpeg"];

    log(
        `Initializing Photos module with collections ${collectionNameFileInfo}, ${collectionNameFaceData}, ${collectionNamePeople}.`
    );
    log(`Extensions for processing: ${extensions.join(", ")}`);

    // Initialize facepi
    let detectFaces, recognizeFaces;

    const faceFunctions = await getFaceFunctions();

    if (!faceFunctions) {
        log(
            `Unable to load FaceApi. Face detection/recognition will not be available.`
        );
    } else {
        detectFaces = faceFunctions.detectFaces;
        recognizeFaces = faceFunctions.recognizeFaces;

        log(`FaceApi loaded successfully.`);
    }

    async function getCtrlFieldFromDynforms() {
        let ctrlField;

        try {
            const data = await axios.get(`http://johannes-mb.wnet.wn:3010/db/_ctrlField`);
            ctrlField = data.data?.__ctrl;
            
            log(`New control field: ${JSON.stringify(ctrlField)}`);
        } catch (err){
            log(`Unable to obtain control field from dynforms.`);
            console.log(err)
        }

        return ctrlField;
    }

    async function addDirectoryToDb(path) {
        const files = scanDirectory(path, extensions);
        const promises = [];

        log(`addDirectoryToDb: Start processing ${files.length} files.`);

        const filesToProcess = files.filter((file) =>
            shouldProcess(file, extensions)
        );
        log(
            `addDirectoryToDb: Filtered out ${
                files.length - filesToProcess.length
            } invalid files.`
        );
        
        const filesInfo = await processFilesSequentially(
            filesToProcess,            
        );

        const fileInfoRecordsInserted = filesInfo.filter(
            (fileInfo) => fileInfo.ops.fileInfo === "insert"
        ).length;
        const faceDataRecordsInserted = filesInfo.filter(
            (fileInfo) => fileInfo.ops.faceData === "insert"
        ).length;

        log(
            `addDirectoryToDb: Added ${fileInfoRecordsInserted} fileInfo records, ${faceDataRecordsInserted} faceData records. Finished.`
        );

        const result = {
            result: {
                fileInfoRecordsInserted,
                faceDataRecordsInserted,
            },
            filesInfo,
        };

        return result;
    }

    async function processFile(file, detectFacesImmediately = false) {
        log(`-- Processing file: ${file}`);

        const existingData = await getDataForFile(file);

        let fileInfo;
        let faceData;
        let ops = {
            fileInfo: null,
            faceData: null,
        };

        if (Object.keys(existingData).length) {
            const presentRecords = [];
            if (existingData.fileInfo) {
                fileInfo = existingData.fileInfo;
                presentRecords.push("fileInfo");
            }
            if (existingData.faceData) {
                faceData = existingData.faceData;
                presentRecords.push("faceData");
            }

            log(`Already have the following: ${presentRecords.join(", ")}`);
        }

        let faceDataId = faceData?._id;

        if (!faceDataId && detectFacesImmediately) {
            // Add a faceData record.
            const faceDataRecord = await processFaces(file);
            if (faceDataRecord) {
                ops.faceData = "insert";
                faceData = faceDataRecord;
                faceDataId = faceDataRecord._id;
            }
        }

        if (!fileInfo) {
            const ctrlField = await getCtrlFieldFromDynforms();
            fileInfo = await new Promise(async (resolve) => {
                let fileInfo;

                fileInfo = getBasicMeta(file, fileInfo);
                fileInfo = await getExifData(file, fileInfo);

                // Add in the ctrl field
                if (ctrlField) {
                    fileInfo.__ctrl = { ...ctrlField };
                }

                // Add the link to face data if we have it.
                if (faceDataId) {
                    fileInfo._faceDataId = faceDataId;
                }

                // Add the main fileInfo record.
                const insertResult = await addFileToDb(
                    fileInfo,
                    collectionName
                );
                if (insertResult) {
                    ops.fileInfo = "insert";
                }
                resolve(fileInfo);
            });
        }

        log(`Done with: ${file}`);
        return { ops, fileInfo, faceData };
    }

    // Asynchronous function to process all files sequentially
    async function processFilesSequentially(filenames) {
        const filesInfo = [];
        for (const filename of filenames) {
            filesInfo.push(await processFile(filename));
        }

        return filesInfo;
    }

    function shouldProcess(file = "", extensions = [".jpg", ".jpeg"]) {
        const { extension, filename, dirname } = parsePath(file);

        if (
            !(filename.substr(0, 1) !== "." && extensions.includes(extension))
        ) {
            return false;
        }

        return true;
    }

    function getBasicMeta(file = "", fileInfo = {}) {
        if (!file) {
            return fileInfo;
        }

        const { extension, filename, dirname } = parsePath(file);
        const { size, uid, gid } = fs.statSync(file);

        fileInfo = {
            ...{
                fullname: file,
                extension,
                filename,
                dirname,
                size,
                uid,
                gid,
            },
        };

        log(`Got basic meta for ${file}`);

        return fileInfo;
    }

    function getExifData(file = "", fileInfo = {}) {
        return new Promise((resolve) => {
            if (!file) {
                resolve(fileInfo);
            }

            try {
                const buffer = fs.readFileSync(file);
                const parser = ExifParser.create(buffer);

                const tags = parser.parse();

                fileInfo.width = tags?.imageSize?.width;
                fileInfo.height = tags?.imageSize?.height;
            } catch (err) {
                console.log(err.message);
            }

            ExifReader.load(file)
                .then((data) => {
                    const tags = data;
                    // Convert the date-time info to a JS parseable string.
                    const convertDateTime = (dateTimeRaw) => {
                        const parts = dateTimeRaw.split(" ");
                        const date = parts[0].replaceAll(":", "-");
                        const time = parts[1];
                        return date + " " + time;
                    };

                    const exifData = {
                        width: fileInfo.width ?? tags["Image Width"]?.value,
                        height: fileInfo.height ?? tags["Image Height"]?.value,
                        dateTime: convertDateTime(
                            tags["DateTimeOriginal"]?.value[0] ??
                                tags["DateTimeDigitized"]?.value[0] ??
                                ""
                        ),
                        device: {
                            make: tags["Make"]?.value,
                            model: tags["Model"]?.value,
                        },
                        orientation: tags["Orientation"]?.value,
                    };

                    if (exifData.width && exifData.height) {
                        fileInfo.aspect = exifData.width / exifData.height;
                    }

                    fileInfo = {
                        ...fileInfo,
                        ...exifData,
                    };

                    log(`Got exif data for ${file}`);

                    resolve(fileInfo);
                })
                .catch((err) => {
                    log(`Exif-Error: ${file} ${err.message}`);
                    resolve(fileInfo);
                });
        });
    }

    async function processFaces(file) {
        const faceData = await getFaceData(file);

        // If we have face data, add a faceData record and return it.
        if (faceData) {
            const faceDataRecord = {
                fullname: file,
                faceData,
            };

            const faceDataCollection = getEnhancedCollection(
                db,
                collectionNameFaceData
            );
            let result;

            try {
                await faceDataCollection.insertOne(faceDataRecord, null);
                log(`${faceDataRecord.faceData.length} faces found; added facedata record with id ${faceDataRecord._id}.`);
            } catch (err) {
                // Couldn't insert.
            }

            // If the insert was successful, faceDataRecord now has an _id field.
            if (faceDataRecord._id) {
                return faceDataRecord;
            }
        }

        return null;
    }

    async function getFaceData(file = "") {
        if (!detectFaces) {
            log(`Unable to run face recognition, skipping.`);
            return null;
        }

        let faceData;

        try {
            faceData = await detectFaces(file);
        } catch (err) {
            console.log(err);
        }

        return faceData;
    }
    

    async function storeReferenceFaceData(faceDataRecordId, namesInfo = []) {
        if (!faceDataRecordId || !namesInfo.length) {
            return null;
        }

        // Make sure the indices are numbers.
        namesInfo.forEach((nameinfo, index) => namesInfo[index].index = parseInt(namesInfo[index].index));

        // Retrieve the faceDataRecord
        const faceDataRecord = await faceDataCollection.findFirst({_id: new ObjectId(faceDataRecordId)});
    
        if (!faceDataRecord) {
            log(`Error: FaceDataRecord ${faceDataRecordId} is missing!`);
            return;
        }

        /**
         * Go through each object in namesInfo, and
         * - retrieve or create a people record
         * - check if the descriptor from faceDataRecordId is already present
         * - if it's not: add it, and conversely put a personRecordId on the faceInfo in faceDataRecord
         */

        for (const nameInfo of namesInfo) {
            const { index, firstName, lastName } = nameInfo;

            if (!firstName || !lastName) {
                // Nothing to do - no actual information was sent.
                log(`Skipping nameInfo ${index}, it has no data.`);
                continue;
            }

            const fullName = `${firstName} ${lastName}`;
            log(`Processing data for ${fullName}.`);

            // See if we have a record for the person referenced.
            let personRecord = await peopleCollection.findFirst({fullName});

            // Create if not exists.
            if (!personRecord) {
                personRecord = {
                    fullName,
                    firstName,
                    lastName,
                    faceDescriptors: [],
                }

                await peopleCollection.insertOne(personRecord);
            }
                     
            // Find the descriptor for this person on the faceDataRecord
            const detectionOnFaceDataRecord = faceDataRecord.faceData.find(item => item.index === index);
               
            // See if this descriptor already exists on the person.
            const existingDescriptor = personRecord.faceDescriptors.find(faceDescriptorObject => {
                return faceDescriptorObject.faceDataRecordId.toString() === faceDataRecordId
            });
            
            if (!existingDescriptor) {
                // Make a copy for the person record, with a reference to where it came from.
                const faceDescriptorObject = {
                    faceDataRecordId: new ObjectId(faceDataRecordId),
                    ...detectionOnFaceDataRecord,
                }

                // Do not store the personRecordId.
                delete faceDescriptorObject.personRecordId;

                personRecord.faceDescriptors.push(faceDescriptorObject);
                await peopleCollection.mUpdateOne({_id: personRecord._id}, personRecord);
                
                log(`Added face descriptor to ${fullName}. They now have ${personRecord.faceDescriptors.length}.`);
            } else {
                // Nothing to do.
                log(`Provided faceDescriptor already exists for ${fullName} - not updating their person record.`);
            }

            // Mark this on the faceDataRecord as a reference descriptor for this person.
            detectionOnFaceDataRecord.isReferenceDescriptor = true;
            detectionOnFaceDataRecord.isManuallySet = true;
            detectionOnFaceDataRecord.personRecordId = personRecord._id;
            await faceDataCollection.mUpdateOne({_id: faceDataRecord._id}, faceDataRecord);        

            log(`Updated faceDataRecord ${faceDataRecord._id}, marking this descriptor as reference to ${fullName}.`);
        }        
    }

    /**
     * Purge records for files that are no longer present.
     */
    async function purgeMissingFiles() {
        let fileInfoRecords;

        try {
            fileInfoRecords = await fileInfoCollection.find({missingAt: { $exists: true }}).toArray();
            log(`Purging records for ${fileInfoRecords.length} missing files.`);            
        } catch (err) {
            log(`Error: Encountered an error while attempting to purge records for missing files: ${err.message}. Aborting.`, 'red');
            return;
        }  

        const missingCount = fileInfoRecords.length;

        for (let i = 0; i < missingCount; i++) {
            const fileInfoRecord = fileInfoRecords[i];
            const faceDataRecordId = fileInfoRecord._faceDataId;
            log(`-- Removing data for fileInfoRecord ${fileInfoRecord._id} --`);
            if (faceDataRecordId) {
                const filter = { _id: new ObjectId(faceDataRecordId) };
                const faceDataRecord = await faceDataCollection.findFirst(filter);

                if (faceDataRecord) {                    
                    try {
                        await faceDataCollection.deleteOne(filter);
                        log(`Removed connected faceDataRecord ${faceDataRecordId}`);
                        /**
                         * Note: 
                         *  Reference-descriptors in peopleCollection are not currently deleted when their source image is purged.
                         *  This should probably be implemented.
                         */
                    } catch (err) {
                        log(`Error: ${err.message} Could not remove faceDataRecord ${faceDataRecordId}.`);
                    }                                        
                }
            }

            await fileInfoCollection.deleteOne({_id: fileInfoRecord._id});
            log(`Removed fileInfoRecord ${fileInfoRecord._id}`);
        }

    }
    /**
     * Check if the file described by the fileInfo record exists in the filesystem.
     * Set fileInfo.missingAt  accordingly.
     */
    async function validateFile(fileInfo) {
        if (typeof(fileInfo) !== 'object') {
            return null;
        }

        const previouslyMissing = fileInfo.missingAt;
        const currentlyMissing = !fs.existsSync(fileInfo.fullname);
        
        if (!previouslyMissing && currentlyMissing) {            
            // It has newly gone missing.
            fileInfo.missingAt = new Date();
            await fileInfoCollection.mUpdateOne({_id: fileInfo._id}, fileInfo);
        }
        
        if (previouslyMissing && !currentlyMissing) {
            // It has newly been rediscovered.
            delete fileInfo.missingAt;
            await fileInfoCollection.mUpdateOne({_id: fileInfo._id}, fileInfo);
        }

        return fileInfo.missingAt;
    }

    /**
     * Get an object with fileInfo and faceData record, if present.
     */
    async function getDataForFile(file) {
        let data = {};

        try {
            // See if we have a fileInfo record.
            const records = await fileInfoCollection
                .find({ fullname: file })
                .toArray();
            if (records.length) {
                data.fileInfo = records[0];
            }
            
            validateFile(data.fileInfo);

            // See if we have face data.
            const faceDataRecord = await faceDataCollection.findFirst({ fullname: file })
            if (faceDataRecord) {
                // Found face data.
                data.faceData = { ...faceDataRecord };

                // Get ids of people referenced in the faceData and pull the records.
                const personRecordIds = faceDataRecord.faceData.map(item => item.personRecordId);
                data.personRecords = await peopleCollection.find({}).toArray();
                data.personRecords.sort((a, b) => {
                    const composedA = a.lastName + a.firstName;
                    const composedB = b.lastName + b.firstName;

                    return composedA > composedB ? 1 : -1;
                });
            }

            return data;
        } catch (err) {
            console.log(err);
        }

        return data;
    }

    async function getFaceDataRecord(_id) {
        return await faceDataCollection.findFirst({_id: new ObjectId(_id)});
    }

    async function updateFaceDataRecord(record) {
        return await faceDataCollection.mUpdateOne({_id: record._id}, record);
    }

    async function getPersonRecords(filter = {}) {
        return await peopleCollection.find({}).toArray();
    }

    /**
     * See if the descriptor is referenced by a person and return the record if so.
     */
    async function getReferencingPersonRecord(faceDescriptor) {

    }

    async function recognizeFacesInFile(fileData, personRecords) {
        const faceDataRecord = fileData.faceData;
        const { faceData } = faceDataRecord;
        if (!Array.isArray(faceData) || !Array.isArray(personRecords)) {
            return null;
        }

        const result = [];

        for (let h = 0; h < faceData.length; h++) {

            for (let i = 0; i < personRecords.length; i++) {
                const personRecord = personRecords[i];
                const referenceFaceDescriptorItems = personRecord.faceDescriptors;

                if (!Array.isArray(personRecord.faceDescriptors)) {
                    // Have no reference for this person.
                    continue;
                }
                
                const match = await recognizeFaces(faceData[h], personRecord);

                if (match) {
                    result.push(
                        {                            
                            testFaceIndex: h,
                            ...match
                        }
                    );
                }                
            }        
        }

        fileData.matchInfo = {
            faceDataRecordId: faceDataRecord._id,
            matches: [ ...result ],
            result
        }

        return result;
    }

    async function addFileToDb(
        fileInfo,
        collectionName = constants.defaultCollectionName
    ) {        
        let result;
        try {            
            result = await fileInfoCollection.insertOne(fileInfo, null, [
                "fullname",
            ]);
            log(`Added fileInfo record with id ${fileInfo._id}`);
        } catch (err) {
            console.log(err);
        }

        return result;
    }

    async function getRandomPicture(
        collectionName = constants.defaultCollectionName
    ) {
        let result;
        try {
            result = await fileInfoCollection
                .aggregate([
                    { $match: { missingAt: { $exists: false } } },
                    { $sample: { size: 1 } }
                ])
                .toArray();
        } catch (err) {
            console.log(err);
        }

        return result;
    }

    async function getCount(filter) {        
        let count = -1;

        try {
            if (typeof filter === 'object') {
                count = await fileInfoCollection
                    .find(filter)
                    .countDocuments();
            } else {
                count = await fileInfoCollection.countDocuments();
            }
        } catch (err) {
            console.log(err);
        }

        return count;
    }

    async function getRecords() {
        try {
            const records = await fileInfoCollection.find({}).toArray();
            return records;
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    async function getRecordWithIndex(index = 0) {
        try {
            index = parseInt(index);
            const records = await fileInfoCollection
                .find({})
                .skip(index)
                .limit(1)
                .toArray();
            const record = records.length ? records[0] : null;
            return record;
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    async function getDataForFileWithIndex(index = 0) {
        try {
            index = parseInt(index);
            const record = await getRecordWithIndex(index);
            let data = record;
            if (record) {
                data = await getDataForFile(record.fullname);
            }

            return data;
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    return {
        addDirectoryToDb,
        getRandomPicture,
        getCount,
        getDataForFileWithIndex,
        getFaceDataRecord,
        updateFaceDataRecord,
        getPersonRecords,
        getRecords,
        getRecordWithIndex,
        storeReferenceFaceData,
        recognizeFacesInFile,
        processFaces,
        purgeMissingFiles,
    };
}

export default Photos;
