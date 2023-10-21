import constants from '../constants.js';
import chalk from 'chalk';
import fs from 'fs';

import path from 'path';

// https://allenhwkim.medium.com/nodejs-walk-directory-f30a2d8f038f
function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach( f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
};


function scanDirectory(path = './', extensions = ['json']) {
    const files = [];

    walkDir(path, (file => {
        const parts = file.split('.');
        const ext = parts[parts.length - 1];
        if (extensions.includes(ext)) {
            files.push(file);
        }        
    }));

    return files;
}

export { 
    scanDirectory 
}