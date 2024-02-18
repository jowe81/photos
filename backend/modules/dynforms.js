import constants from "../constants.js";
import axios from "axios";
import { log } from "../helpers/jUtils.js";

const dynformsBaseUrl = `${process.env.DYNFORMS_HOST}:${process.env.DYNFORMS_PORT}`;

async function processDynformsPullRequest({ connectionName, collectionName, sessionId, filter, orderBy, settings }) {
    console.log(settings)
    try {
        log(`Forwarding request to dynforms@${dynformsBaseUrl}`);
        const dynformsResponse = await axios.post(`${dynformsBaseUrl}/db/m2m/pull`, {
            connectionName,
            collectionName,
            sessionId,
            filter,
            orderBy,
            settings,
        });

        return dynformsResponse.data;
    } catch(err) {
        log(`Failed to forward pull request to Dynforms: ${err.message}`, 'red');
    }
}

async function processDynformsPushRequest({ connectionName, collectionName, record }) {
    if (record?.collections) {
        // Sanity
        if (record.collections.includes('trashed')) {
            record.collections = ['trashed'];
        }

        // It's being updated but not deleted; make sure it's in general.
        if (record.collections[0] !== 'trashed') {
            if (!record.collections.includes('general')) {
                record.collections.push("general");
            }
        }        
    }

    try {
        const dynformsResponse = await axios.post(`${dynformsBaseUrl}/db/m2m/push`, {
            connectionName,
            collectionName,
            record,
        })

        return dynformsResponse.data;
    } catch (err) {
        log(`Failed to forward push request to Dynforms: ${err.message}`, "red");
    }
}

// Go through the filter and replace any encoded values, such as dates.
function processFilterObject(filter, callback) {
    for (let key in filter) {
        if (typeof filter[key] === "object" && filter[key] !== null) {
            // Recursively search nested objects
            processFilterObject(filter[key], callback);
        } else if (typeof filter[key] === "string" && filter[key].startsWith("__")) {
            filter[key] = callback(filter[key]);
        }
    }
    console.log('Resolved Filter: ', filter);
}

function processFilterValue(value) {
    let result = value;

    const separatorIndex = value.indexOf("-");
    const keyword = value.substring(2, separatorIndex);
    const payload = value.substring(separatorIndex + 1);
    let parsedPayload;

    switch (keyword) {
        case "DATE":
            // The payload is time in milliseconds.
            // Example: '__DATE-1703785527694'
            result = new Date(parseInt(payload));
            break;

        case "ARRAY_INCLUDES_ITEM":
            // The payload is a json stringified string.
            // Example: '__ARRAY_INCLUDES_ITEM-"favorites"'
            parsedPayload = JSON.parse(payload);
            result = { $elemMatch: { $eq: parsedPayload } };
            break;

        case "ARRAY_INCLUDES_ARRAY_AND":
            // The payload is a json stringified array.
            // Example: '__ARRAY_INCLUDES_ARRAY_AND-
            parsedPayload = JSON.parse(payload);
            result = { $elemMatch: { $all: parsedPayload } };
            break;

        case "ARRAY_INCLUDES_ARRAY_OR":
            // The payload is a json stringified array.
            // Example: '__ARRAY_INCLUDES_ARRAY_AND-
            parsedPayload = JSON.parse(payload);
            result = { $elemMatch: { $in: parsedPayload } };
            break;
    }

    return result;
}


export { processDynformsPullRequest, processDynformsPushRequest, processFilterObject };
