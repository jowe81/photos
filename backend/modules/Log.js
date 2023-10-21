import constants from '../constants.js';
import chalk from 'chalk';
import fs from 'fs';

import { getFormattedDate, pad } from '../helpers/jUtils.js';

const masterLogFile = 'jj-auto.log';

/**
 * 
 * @param {string} t                  The text to log
 * @param {object} deviceWrapper      The device the message is about
 * @param {string} color              Chalk compatible color
 * @param {object} err 
 * @param {bool} writeToFileOverride  Do not write to file even if the env file says to.
 */
 const log = (t, deviceWrapper, color, err, writeToFileOverride = false) => {
  let date = getFormattedDate() + ' ';
  let prefix = ``;
  if (color === 'debug') {
    color = 'bgRed'
  }

  const channel = deviceWrapper?.channel ? pad(deviceWrapper?.channel, 2) : 0;
  if (channel) {
    prefix += `Ch ${channel}` + (deviceWrapper.device ? ` (${deviceWrapper.alias})` : ``);
  }

  if (deviceWrapper?.type === 'location') {
    prefix += `Location '${deviceWrapper.name}': `;
  }

  let line;
  const colon = channel ? ': ' : '';

  if (err) {
    if (t) {
      //A message was sent along
      line = `${prefix}${colon}${t}:`;
    } else {
      //No message, use err.message
      const msg = err.message ? err.message : 'unknown error'; 
      line = `${prefix}${colon}Error: ${msg}`;
    }
    console.log(date + chalk.red(line), typeof(err) === 'string' ? chalk.red(err) : err);
  } else {
    // Regular message.
    line = `${prefix}${colon}${t}`;
    console.log(date + chalk[color ?? 'green'](line));
  }

  const logToFile = process.env.LOG_DEVICE_EVENTS_TO_FILE;

  if (logToFile && !writeToFileOverride) {

    const logDirectory = process.env.LOG_DIRECTORY;
    const logline = getFormattedDate(null, null) + ' ' + line + '\n';

    try {

      // Verify the directory.
      if (!fs.existsSync(logDirectory)){
        fs.mkdirSync(logDirectory);
      }

      // Device specific logging.
      if (deviceWrapper) {

        const logFileName = channel ?
          `Channel ${pad(channel, 2 , '0')} - ${deviceWrapper.alias}.log` :
          `Unmapped devices.log`;
    
        fs.appendFileSync(
          logDirectory + logFileName, logline
        );
      }

      // Master log file.
      fs.appendFileSync(
        logDirectory + masterLogFile, logline
      )

    } catch (err) {
      console.log(`Could not write to log file in path ${logDirectory}: ${err.message}`, null, null, err);
    }
  }
}

/**
 * Log out the text if DEBUG is set, and either the deviceWrapper matches the debug channel,
 * or no wrapper was passed.
 */

const debug = (text, deviceWrapper) => {
  const debug = constants.DEBUG?.debug;
  const channels = constants.DEBUG?.channels;
  if (debug && (deviceWrapper === null || channels.includes(deviceWrapper.channel))) {
    log(text, deviceWrapper, 'bgRed');
  }
}

export { 
  log,
  debug,
};