

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
 * Returns a collection with enhanced functionality.
 */
function getEnhancedCollection(db, collectionName) {
    const name = collectionName;
    const collection = db.collection(collectionName);
    
    collection._insertMany = collection.insertMany;
    collection._insertOne = collection.insertOne;

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
    collection.insertOne = async (doc, options, uniqueKeys) => {
        const now = new Date();
        doc.created_at = now;
        doc.updated_at = now;

        const records = await collection.find(constructUniqueTestFilter(uniqueKeys, doc)).toArray();

        if (!records.length || !uniqueKeys || (uniqueKeys && !uniqueKeys.length)) {
            try {
                return await collection._insertOne(doc);
            } catch {
                return false;
            }            
        }            

        return false;
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

export {
    constructSearchFilter,
    getEnhancedCollection,
}