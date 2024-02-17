import constants from "../constants.js";
import axios from "axios";
import { log } from "../helpers/jUtils.js";

const dynformsBaseUrl = `${process.env.DYNFORMS_HOST}:${process.env.DYNFORMS_PORT}`;

async function processDynformsPullRequest({ connectionName, collectionName, sessionId, filter, orderBy, settings }) {

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

export { processDynformsPullRequest, processDynformsPushRequest };
