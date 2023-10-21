import constants from '../constants.js';
import chalk from 'chalk';
import fs from 'fs';
import { scanDirectory } from './scanner.js';
import { parsePath } from '../helpers/jUtils.js';
import { getEnhancedCollection } from '../db/dbutils.js';

import path from 'path';


function Photos(dbObject) {

    const db = dbObject;

    async function addDirectoryToDb(path, collectionName, extensions = []) {
        const files = scanDirectory(path, extensions);

        const filesInfo = [];
    
        files.forEach((file) => {        
            const { extension, filename, dirname } = parsePath(file);
            
            if (extensions.includes(extension)) {
                const { size, uid, gid } = fs.statSync(file);
    
                const fileInfo = {
                    fullname: file,
                    extension,
                    filename,
                    dirname,
                    size,
                    uid,
                    gid,
                }         
                
                filesInfo.push(fileInfo);
            }
        })

        return await addFilesToDb(filesInfo, collectionName);        
    }
    
    async function addFilesToDb(filesInfo, collectionName) {
        let result;

        try {
            const collection = getEnhancedCollection(db, collectionName);
            result = await collection.insertMany(filesInfo, null, ['fullname']);    
        } catch (err) {
            console.log(err);
        }
        console.log('result:', result)
        return result;
    }

    return {
        addDirectoryToDb,
    };    
}



export default Photos;