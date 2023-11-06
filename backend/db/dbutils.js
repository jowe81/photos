import { ObjectId } from "mongodb";


function constructSearchFilter(search, fields) {
    if (!search || !fields) {
        return {};
    }
    
    const orQueries = [];

    fields.forEach(field => {
        if (!['subfield_array', 'boolean'].includes(field.type)) {
            orQueries.push({ [field.key] : { '$regex': search, '$options': 'i' }});            
        }
    })

    const filter = { '$or' : orQueries };
    
    return filter;
}

/**
 * Convert an array of strings of the form fieldName|desc and 
 * return an object that can be passed to the Mongo driver.
 * @param array queryItems 
 * @returns {}
 */
function getSortObjectFromQueryData(queryItems) {

    const columnsInfo = [];

    queryItems.forEach(queryItem => {
        if (queryItem) {
            const parts = queryItem.split('|');

            const columnInfo = {
                column: parts[0],
                desc: parts.length ? !!parts[1] : false,
            }

            columnsInfo.push(columnInfo);
        }
    })

    return constructSortObject(columnsInfo);
}

function constructSortObject(columns) {
    if (!Array.isArray(columns)) {
        return { _id: 1 };
    }

    const sortObject = {}

    columns.forEach(columnInfo => {
        const { column, desc } = columnInfo;

        if (column) {
            sortObject[column] = desc ? -1 : 1;
        }        
    });

    // Required: https://www.mongodb.com/docs/manual/reference/method/cursor.skip/#using-skip---with-sort--
    sortObject['_id'] = 1;

    return sortObject;
}

function constructUpdate(doc) {
    delete doc._id;
    delete doc.created_at;
    delete doc.updated_at;
    
    const update = {};

    Object.keys(doc).forEach(key => {
        update[key] = doc[key];
    })

    update.updated_at = new Date();
    
    return { '$set': update };
}

/**
 * Returns a collection with enhanced functionality.
 */
function getEnhancedCollection(db, collectionName) {
    const collection = db.collection(collectionName);
    
    collection._insertMany = collection.insertMany;
    collection._insertOne = collection.insertOne;
    collection._updateOne = collection.updateOne;

    collection.findFirst = async (filter) => {
        const records = await collection.find(filter).toArray();
        if (!records && records.length) {
            return null;
        }

        return records[0];
    }

    /**
     * Insert many with created_at/updated_at fields. Will test for unique with
     * the optionally supplied field key(s).
     */
    collection.insertMany = async (docs, options, uniqueKeys) => {
        const now = new Date();
        docs.forEach(doc => {
            doc.created_at = now;
            doc.updated_at = now;    
        })

        if (uniqueKeys && Array.isArray(uniqueKeys)) {
            // Insert them one by one when unique fieldKey(s) were supplied.
            let promises = [];
            docs.forEach(async doc => promises.push(collection.insertOne(doc, options, uniqueKeys)));

            const results = await Promise.all(promises);

            let insertedCount = 0;
            results.forEach(inserted => inserted && insertedCount++);

            return insertedCount;
        } else {
            return await collection._insertMany(docs, options);
        }        
    }

    /**
     * Insert one with created_at/updated_at fields. Will test for unique with
     * the optionally supplied field key(s).
     */
    collection.insertOne = async (doc, options, uniqueKeys, fields) => {        
        applyFieldsFilter(doc, fields);

        const now = new Date();
        doc.created_at = now;
        doc.updated_at = now;
        
        if (Array.isArray(uniqueKeys)) {
            const records = await collection.find(constructUniqueTestFilter(uniqueKeys, doc)).toArray();
            if (!records.length) {
                try {
                    return await collection._insertOne(doc);
                } catch {
                    return false;
                }
                
            } else {
                return false;
            }            
        } else {
            return await collection._insertOne(doc);
        }
    }

    collection.updateOne = async (filter, doc, uniqueKeys, fields) => {
        applyFieldsFilter(doc, fields);
        
        const update = constructUpdate(doc);
        return await collection._updateOne(filter, update);
    }

    /**
     * Update directly based on _id. No dynforms filter.
     */
    collection.mUpdateOne = async (filter, doc) => {

        const update = constructUpdate(doc);
        return await collection._updateOne(filter, update);
    }

    return collection;
}

function constructUniqueTestFilter(uniqueKeys, doc) {
    const filter = {};
    if (Array.isArray(uniqueKeys)) {
        uniqueKeys.forEach(fieldKey => {
            filter[fieldKey] = doc[fieldKey];
        })
    }

    return filter;
}

function applyFieldsFilter(doc, fields) {
    fields?.forEach(field => {
        const value = doc[field.key];
        
        switch (field.type) {
            case 'boolean':                
                doc[field.key] = !!value;
                break;

            case 'number':
                doc[field.key] = parseInt(value);
                break;
        }

        console.log(`${field.key} -> ${field.type}: ${value} -> ${doc[field.key]}`)
    })
}

export {
    constructSearchFilter,
    constructSortObject,
    getEnhancedCollection,
    getSortObjectFromQueryData,
}