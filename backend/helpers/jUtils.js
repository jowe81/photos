import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import * as url from 'url';

const allAreBoolean = testVariables => {
  let foundNonBoolean = false;

  testVariables.every(testVariable => {
    if (typeof testVariable !== typeof true) {
      foundNonBoolean = true;
      return false; // Break the loop    
    }

    return true;
  })

  return !foundNonBoolean;
}

/**
 * Return an array of filenames in the targetPath
 * 
 * @param {*} targetPath 
 * @param {*} callingScriptPath 
 * @returns 
 */
const getFileNames = (targetPath, callingScriptPath) => {
  const directoryPath = path.join(getSystemConstants(callingScriptPath).__dirname, targetPath);
  return fs.readdirSync(directoryPath);
}

const getFormattedDate = (date, color = 'gray') => {
    if (!date) {
        date = new Date();
    }

    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    const formattedDate = `${year}/${pad(month, 2, '0')}/${pad(day, 2, '0')}`;
    const formattedTime = `${pad(hours, 2, '0')}:${pad(minutes, 2, '0')}:${pad(seconds, 2, '0')}`;

    const text = `${formattedDate} ${formattedTime}`
    return color ? chalk[color](text) : text;
}

/**
 * Return the constants for the urlPath passed in
 * 
 * @param string urlPath 
 * @returns 
 */
const getSystemConstants = (urlPath) => {
  if (!urlPath) {
    return null;
  }

  // From https://blog.logrocket.com/alternatives-dirname-node-js-es-modules/
  return {
    __filename: url.fileURLToPath(urlPath),
    __dirname: url.fileURLToPath(new URL('.', urlPath)),  
  }
}

/**
 * Return the value that lies the specified percentage between value and altValue.
 * 
 * @param {*} value 
 * @param {*} altValue 
 * @param {*} percentage 
 */
const scale = (value, altValue, percentage, decimals = 0) => {
  const range = altValue - value;  
  const fullResult = value + (percentage * range);

  return parseFloat(fullResult.toFixed(decimals));
}

/**
 * Pad the front of a string.
 * @param   string    input 
 * @param   integer   targetLength 
 * @param   string    paddingCharacter 
 * @returns string
 */
const pad = (input, targetLength, paddingCharacter = ' ') => {
    if (!input) { 
      input = '' 
    };

    if (typeof(input) === 'number') {
        input = input.toString();
    }

    const repeats = Math.max(targetLength - input.length, 0);

    //Default to '0'
    if (!paddingCharacter) {
        paddingCharacter = '0';
    }

    return paddingCharacter.repeat(repeats) + input;
}

const log = (text, color = null, err) => {
  let styled;
  if (err) {
    styled = chalk.red(text ?? err.message);
    console.log(getFormattedDate() + ` ${styled}`, err);
  } else {
    styled = color ? chalk[color](text) : text;
    console.log(getFormattedDate() + ` ${styled}`);
  }  
}


const findByField = (field, value, arr, returnIndex = false) => {
  if (!field || !value || !arr) {
    return null;
  }

  let foundItem = null;
  let foundIndex = null;

  arr.every((item, index) => {
    if (item && (item[field] === value)) {
      foundItem = item;
      foundIndex = index;
      return false;
    }

    return true;
  })

  return returnIndex ? foundIndex : foundItem;
}

const findById = (id, arr) => {
  return findByField('id', id, arr);
}

export {
    allAreBoolean,
    findByField,
    findById,
    getFileNames,
    getFormattedDate,
    getSystemConstants,
    pad,
    log,
    scale,    
}

