import constants from '../constants.js';
import chalk from 'chalk';
import fs from 'fs';
import ExifParser from 'exif-parser';
import ExifReader from 'exifreader';

import { scanDirectory } from './Scanner.js';
import { parsePath } from '../helpers/jUtils.js';
import { getEnhancedCollection } from '../db/dbutils.js';

import path, { resolve } from 'path';


function Photos(dbObject) {

    const db = dbObject;
    const collectionName = 'photos';

    async function addDirectoryToDb(path, collectionName = constants.defaultCollectionName, extensions = []) {
        const files = scanDirectory(path, extensions);

        const filesInfo = [];
    
        const promises = [];

        files.forEach(async (file) => {
            promises.push(new Promise((resolve, reject) => {
                const { extension, filename, dirname } = parsePath(file);
            
                if (extensions.includes(extension)) {
                    const { size, uid, gid } = fs.statSync(file);

                    let fileInfo = {
                        fullname: file,
                        extension,
                        filename,
                        dirname,
                        size,
                        uid,
                        gid,
                    }         
                    
                    const buffer = fs.readFileSync(file);
                    const parser = ExifParser.create(buffer);            
                    const tagsA = parser.parse();
    
                    ExifReader.load(file).then(data => {
                        const tagsB = data;

                        // Convert the date-time info to a JS parseable string.
                        const convertDateTime = (dateTimeRaw) => {
                            const parts = dateTimeRaw.split(' ');
                            const date = parts[0].replaceAll(':', '-');
                            const time = parts[1];
                            return date + ' ' + time;                            
                        }

                        const exifData = {
                            width: tagsA?.imageSize?.width ?? tagsB['Image Width']?.value,
                            height: tagsA?.imageSize?.height ?? tagsB['Image Height']?.value,
                            dateTime: convertDateTime(tagsB['DateTimeOriginal']?.value[0] ?? tagsB['DateTimeDigitized']?.value[0] ?? ''),
                            device: { 
                                make: tagsB['Make']?.value,
                                model: tagsB['Model']?.value,
                            },
                            orientation: tagsB['Orientation']?.value,
                        }

                        if (exifData.width && exifData.height) {
                            fileInfo.aspect = exifData.width / exifData.height;
                        }

                        fileInfo = {
                            ...fileInfo,
                            ...exifData,
                        }
                        
                        resolve(fileInfo);
                    }).catch(reject);                                                        
                }
    
            }));     
        })

        return Promise
            .all(promises)
            .then(filesInfo => addFilesToDb(filesInfo, collectionName));        
    }
    
    async function addFilesToDb(filesInfo, collectionName = constants.defaultCollectionName) {
        let result;

        try {
            const collection = getEnhancedCollection(db, collectionName);
            result = await collection.insertMany(filesInfo, null, ['fullname']);    
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
        console.log('result', result)
        return result;
    }

    return {
        addDirectoryToDb,
        getRandomPicture,
    };    
}



export default Photos;