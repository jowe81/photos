import constants from '../constants.js';
import chalk from 'chalk';
import fs from 'fs';

import path from 'path';

// https://allenhwkim.medium.com/nodejs-walk-directory-f30a2d8f038f
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) {
    return;
  }
  
  fs.readdirSync(dir).forEach( f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
};


function scanDirectory(path = './', extensions = []) {
    const files = [];

    walkDir(path, (file => {
        files.push(file);
    }));

    return files;
}

export { 
    scanDirectory 
}