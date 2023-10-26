import constants from '../constants.js';
import chalk from 'chalk';
import fs from 'fs';
import ExifParser from 'exif-parser';

import { scanDirectory } from './scanner.js';
import { parsePath } from '../helpers/jUtils.js';
import { getEnhancedCollection } from '../db/dbutils.js';

import path from 'path';


function Photos(dbObject) {

    const db = dbObject;
    const collectionName = 'photos';

    async function addDirectoryToDb(path, collectionName = constants.defaultCollectionName, extensions = []) {
        const files = scanDirectory(path, extensions);

        const filesInfo = [];
    
        files.forEach((file) => {        
            const { extension, filename, dirname } = parsePath(file);
            
            if (extensions.includes(extension)) {
                const { size, uid, gid } = fs.statSync(file);

                const buffer = fs.readFileSync(file);
                const parser = ExifParser.create(buffer);            
                const tags = parser.parse();
    
                const fileInfo = {
                    fullname: file,
                    extension,
                    filename,
                    dirname,
                    size,
                    uid,
                    gid,
                    width: tags?.imageSize?.width,
                    height: tags?.imageSize?.height,                
                }         
                
                filesInfo.push(fileInfo);
            }
        })

        return await addFilesToDb(filesInfo, collectionName);        
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