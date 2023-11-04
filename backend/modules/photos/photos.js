import constants from '../../constants.js';
import chalk from 'chalk';
import fs from 'fs';
import ExifParser from 'exif-parser';
import ExifReader from 'exifreader';

import { scanDirectory } from '../scanner.js';
import { parsePath } from '../../helpers/jUtils.js';
import { getEnhancedCollection } from '../../db/dbutils.js';
import { getRecognizeFacesFunction } from './faceRecognition.mjs';

import { log } from './../Log.js';
import { resolve } from 'path';
import { Console } from 'console';



function Photos(dbObject, collectionName) {

    const db = dbObject;
    
    if (!collectionName) {
        collectionName = constants.defaultCollectionName;
    }

    const collectionNameFaceData = `${collectionName}FaceData`;

    const fileInfoCollection = getEnhancedCollection(db, collectionName);
    const faceDataCollection = getEnhancedCollection(db, collectionNameFaceData);

    const extensions = ['.jpg', '.jpeg'];
    
    log(`Initializing Photos module with fileInfoCollection names ${collectionName}, ${collectionNameFaceData}.`);
    log(`Extensions for processing: ${extensions.join(', ')}`);

    // Initialize facepi
    let recognizeFaces;
    getRecognizeFacesFunction().then(recognizeFacesFunction => {
        if (!recognizeFacesFunction) {
            log(`Unable to load FaceApi. Face detection/recognition will not be available.`);
        }
        recognizeFaces = recognizeFacesFunction;
        log(`FaceApi loaded successfully.`);    
    });

    async function addDirectoryToDb(path) {
        const files = scanDirectory(path, extensions);    
        const promises = [];
        
        log(`addDirectoryToDb: Start processing ${files.length} files.`);

        const filesToProcess = files.filter((file) => shouldProcess(file, extensions));
        log(`addDirectoryToDb: Filtered out ${files.length - filesToProcess.length} invalid files.`);

        const filesInfo = await processFilesSequentially(filesToProcess, collectionName);

        const fileInfoRecordsInserted = filesInfo.filter(fileInfo => fileInfo.ops.fileInfo === 'insert').length;
        const faceDataRecordsInserted = filesInfo.filter(fileInfo => fileInfo.ops.faceData === 'insert').length;

        log(`addDirectoryToDb: Added ${fileInfoRecordsInserted} fileInfo records, ${faceDataRecordsInserted} faceData records. Finished.`);

        const result = {
            result: {
                fileInfoRecordsInserted,
                faceDataRecordsInserted
            },
            filesInfo,
        }

        return result;
    }

    async function processFile(file, collectionName) {
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
                presentRecords.push('fileInfo');
            }
            if (existingData.faceData) {
                faceData = existingData.faceData;
                presentRecords.push('faceData');
            }
            
            log(`Already have the following: ${presentRecords.join(', ')}`);
        }

        let faceDataId = faceData?._id;

        if (!faceDataId) {
            // Add a faceData record.
            const faceDataRecord = await processFaces(file);
            if (faceDataRecord) {
                ops.faceData = 'insert';
                faceData = faceDataRecord;
                faceDataId = faceDataRecord._id;
            }
        }

        if (!fileInfo) {
            fileInfo = await new Promise(async (resolve) => {
                let fileInfo = {};
                
                fileInfo = getBasicMeta(file, fileInfo);        
                fileInfo = await getExifData(file, fileInfo);
                
                // Add the link to face data if we have it.
                if (faceDataId) {
                    fileInfo._faceDataId = faceDataId;
                }

                // Add the main fileInfo record.
                const insertResult = await addFileToDb(fileInfo, collectionName);
                if (insertResult) {
                    ops.fileInfo = 'insert';
                }
                resolve(fileInfo);        
            });
        }

        log(`Done with: ${file}`);
        return { ops, fileInfo, faceData };
    }
      
    // Asynchronous function to process all files sequentially
    async function processFilesSequentially(filenames, collectionName) {
        const filesInfo = [];
        for (const filename of filenames) {
            filesInfo.push(await processFile(filename, collectionName));
        }
    
        return filesInfo;
    }
    
    function shouldProcess(file = '', extensions = ['.jpg', '.jpeg']) {
        const { extension, filename, dirname } = parsePath(file);

        if (!(filename.substr(0,1) !== '.' && extensions.includes(extension))) {
            return false;
        }

        return true;
    }
    
    function getBasicMeta(file = '', fileInfo = {}) {
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
            }
        };

        log(`Got basic meta for ${file}`)

        return fileInfo;
    }
      
    function getExifData(file = '', fileInfo = {}) {
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
            
            ExifReader
                .load(file)
                .then(data => {
                    const tags = data;
                    // Convert the date-time info to a JS parseable string.
                    const convertDateTime = (dateTimeRaw) => {
                        const parts = dateTimeRaw.split(' ');
                        const date = parts[0].replaceAll(':', '-');
                        const time = parts[1];
                        return date + ' ' + time;                            
                    }
        
                    const exifData = {
                        width: fileInfo.width ?? tags['Image Width']?.value,
                        height: fileInfo.height ?? tags['Image Height']?.value,
                        dateTime: convertDateTime(tags['DateTimeOriginal']?.value[0] ?? tags['DateTimeDigitized']?.value[0] ?? ''),
                        device: { 
                            make: tags['Make']?.value,
                            model: tags['Model']?.value,
                        },
                        orientation: tags['Orientation']?.value,
                    }
    
                    if (exifData.width && exifData.height) {
                        fileInfo.aspect = exifData.width / exifData.height;
                    }
        
                    fileInfo = {
                        ...fileInfo,
                        ...exifData,
                    }

                    log(`Got exif data for ${file}`);

                    resolve(fileInfo);
                })
                .catch(err => {
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
                file,
                faceData
            }

            const faceDataCollection = getEnhancedCollection(db, collectionNameFaceData);
            let result;

            try {
                await faceDataCollection.insertOne(faceDataRecord, null);
                log(`Added facedata record with id ${faceDataRecord._id}`);
            } catch(err) {
                // Couldn't insert.
            }

            // If the insert was successful, faceDataRecord now has an _id field.
            if (faceDataRecord._id) {
                return faceDataRecord;
            }                
        }

        return null;
    }
    
    async function getFaceData(file = '') {        
        if (!recognizeFaces) {
            log(`Unable to run face recognition, skipping.`);
            return null;
        }
            
        let faceData;

        try {
            faceData = await recognizeFaces(file);
        } catch(err) {
            console.log(err)
        }
        
        log(`Got data for ${faceData.length} detected faces.`);
        return faceData;
    }
    
    /**
     * Get an object with fileInfo and faceData record, if present.
     */
    async function getDataForFile(file) {
        let data = {};

        try {            
            // See if we have a fileInfo record.
            const records = await fileInfoCollection.find({'fullname': file}).toArray();
            if (records.length) {
                data.fileInfo = records[0];
            }

            // See if we have face data.
            const faceDataRecords = await faceDataCollection.find({file}).toArray();            
            if (faceDataRecords.length) {
                // Found face data.
                data.faceData = faceDataRecords[0];
            }

            return data;
        } catch (err) {
            console.log(err);
        }

        return data;
    }

    async function addFileToDb(fileInfo, collectionName = constants.defaultCollectionName) {
        let result;
        try {
            result = await fileInfoCollection.insertOne(fileInfo, null, ['fullname']);
            log(`Added fileInfo record with id ${fileInfo._id}`);
        } catch (err) {
            console.log(err);
        }

        return result;
    }

    async function getRandomPicture(collectionName = constants.defaultCollectionName) {
        let result;
        try {
            result = await fileInfoCollection.aggregate([{ $sample: {size: 1} }]).toArray();  
        } catch (err) {
            console.log(err);
        }        

        return result;
    }

    return {
        addDirectoryToDb,
        getRandomPicture,
    };    
}



export default Photos;