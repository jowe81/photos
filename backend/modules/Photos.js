import constants from '../constants.js';
import chalk from 'chalk';
import fs from 'fs';
import { scanDirectory } from './scanner.js';
import { parsePath } from '../helpers/jUtils.js';

import path from 'path';



function addDirectoryToDb(path, collectionName, extensions = []) {
    const files = scanDirectory(path);

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
    
            
        }
    })
}

function addFileToDb(fileInfo) {

}

export { 
    addFileToDb,
    addDirectoryToDb,
}