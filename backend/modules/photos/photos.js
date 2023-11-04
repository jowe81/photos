import constants from '../../constants.js';
import chalk from 'chalk';
import fs from 'fs';
import ExifParser from 'exif-parser';
import ExifReader from 'exifreader';

import { scanDirectory } from '../scanner.js';
import { parsePath } from '../../helpers/jUtils.js';
import { getEnhancedCollection } from '../../db/dbutils.js';
import { getRecognizeFacesFunction } from './faceRecognition.mjs';

import path, { resolve } from 'path';
import { log } from './../Log.js';
import { rejects } from 'assert';



function Photos(dbObject) {

    const db = dbObject;

    async function addDirectoryToDb(path, collectionName = constants.defaultCollectionName, extensions = []) {
        const files = scanDirectory(path, extensions);    
        const promises = [];
        
        log(`addDirectoryToDb: Start processing ${files.length} files.`);

        const filesToProcess = files.filter((file) => shouldProcess(file, extensions));

        const filesInfo = await processFilesSequentially(filesToProcess, collectionName);

        const recordsInserted = filesInfo.filter(fileInfo => fileInfo.inserted).length;

        log(`addDirectoryToDb: Added ${recordsInserted} items. Finished.`);

        const result = {
            result: {
                recordsInserted: recordsInserted,
            },
            filesInfo,
        }

        return result;
    }

    async function processFile(file, collectionName) {
        // Perform your asynchronous operations on the file here
        log(`-- Processing file: ${file}`);
        // Simulate an asynchronous operation (e.g., reading a file)
        const fileInfo = await new Promise(async (resolve) => {
            let fileInfo = {};
            
            fileInfo = getBasicMeta(file, fileInfo);        
            fileInfo = await getExifData(file, fileInfo);
            fileInfo = await getFaceData(file, fileInfo);
            const insertResult = await addFileToDb(fileInfo, collectionName);
    
            resolve({fileInfo, inserted: !!insertResult});
    
        });
        log(`Done with: ${file}`);
        return fileInfo;
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
    
    async function getFaceData(file = '', fileInfo = {}) {        
        const recognizeFaces = await getRecognizeFacesFunction();

        if (!recognizeFaces) {
            log(`Unable to run face recognition, skipping.`);
            return fileInfo;
        }

        fileInfo._faceData = await recognizeFaces(file);

        log(`Got data for ${fileInfo._faceData} detected faces.`);
    }
    
    async function addFileToDb(fileInfo, collectionName = constants.defaultCollectionName) {
        let result;
        try {
            const collection = getEnhancedCollection(db, collectionName);
            result = await collection.insertOne(fileInfo, null, ['fullname']); 
        } catch (err) {
            console.log(err);
        }

        return result;
    }

    async function addFilesToDb(filesInfo, collectionName = constants.defaultCollectionName) {
        let result;

        const filesInfoFiltered = filesInfo.filter(fileInfo => fileInfo);
        console.log(`Filtered out ${filesInfo.length - filesInfoFiltered.length} invalid items`);
        try {
            const collection = getEnhancedCollection(db, collectionName);
            result = await collection.insertMany(filesInfoFiltered, null, ['fullname']); 
            console.log(result);
        } catch (err) {
            console.log(err);
        }

        return result;
    }

    async function getRandomPicture(collectionName = constants.defaultCollectionName) {
        let result;
        try {
            const collection = getEnhancedCollection(db, collectionName);
            result = await collection.aggregate([{ $sample: {size: 1} }]).toArray();  
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