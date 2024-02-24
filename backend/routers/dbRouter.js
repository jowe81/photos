import fs from "fs";
import sharp from "sharp";
import _ from "lodash";
import { log } from "../helpers/jUtils.js";
import { ObjectId } from "mongodb";
import constants from "../constants.js";
import { processDynformsPullRequest, processDynformsPushRequest, processFilterObject } from "../modules/dynforms.js";

const initRouter = (express, db, photos) => {
    const castId = (obj) => (obj._id = obj._id ? new ObjectId(obj._id) : null);

    const cache = {
        collectionsLastAddedTo: [],
        lastPulledRecord: null,
        lastPushedRecord: null,
    };

    function updateCollectionsLastAddedTo(record) {            
        const oldCollections = cache.lastPulledRecord?.collections;
        const newCollections = record?.collections;
        let collectionsLastAddedTo = cache.collectionsLastAddedTo;

        newCollections?.forEach((newCollectionName) => {
            if (['general', 'trashed'].includes(newCollectionName)) {
                return;
            }

            if (!oldCollections || !oldCollections.includes(newCollectionName)) {
                // This one wasn't on the record previously, it got added.
                // Remove it from the list if it's in there, then put it to the front.
                collectionsLastAddedTo = collectionsLastAddedTo.filter(collectionName => collectionName !== newCollectionName)
                collectionsLastAddedTo.unshift(newCollectionName);
                cache.collectionsLastAddedTo = [...collectionsLastAddedTo];
            }
        })
    }

    const logError = (err) => { 
        log(`Error: ${err.message}`);
        console.log(err);
    };

    const dbRouter = express.Router();

    dbRouter.use((err, req, res, next) => {
        logError(err);
        res.status(500).send(err);
        next(err);
    });

    dbRouter.use((req, res, next) => {
        log(`${req.ip} /post/dbRouter${req.url} (${req.headers["user-agent"]})`);
        next();
    });

    dbRouter.get("/addAssets/", async (req, res) => {
        const { path } = req.query;

        if (path) {
            const data = await photos.addDirectoryToDb("./" + path);
            res.json({ data });
        }
    });

    dbRouter.get("/randomUrl", async (req, res) => {
        // Return a URL to a random picture.
        try {
            const docs = await photos.getRandomPicture();
            if (docs.length) {
                const doc = docs[0];
                res.json({
                    ...doc,
                    url: constants.baseUrl + "/" + doc.fullname,
                });
            } else {
                // There are no pictures in the db.
                res.json({ url: null });
            }
        } catch (err) {
            console.log(err);
            res.status(500).send();
        }
    });

    dbRouter.get("/randomRedirect", async (req, res) => {
        // Redirect to a random picture.
        try {
            const docs = await photos.getRandomPicture();
            if (docs.length) {
                const doc = docs[0];
                res.redirect(`../../${doc.fullname}`);
            }
        } catch (err) {
            res.status(500).send();
        }
    });

    dbRouter.get("/photoRecord", async (req, res) => {
        if (req.query.index) {
            let index = req.query.index ?? 0;

            try {
                const count = await photos.getCount();

                if (index < 0) {
                    index = 0;
                } else if (index >= count) {
                    index = count - 1;
                }

                if (index > -1) {
                    const fileData = await photos.getDataForFileWithIndex(index);

                    const data = {
                        ...fileData,
                        count,
                        index,
                    };

                    res.json({ success: true, data });
                }
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        } else if (req.query._id) {
            let _id = req.query._id;

            try {
                const record = await photos.getRecordWithId(_id);
                res.json({ success: true, record });
            } catch (err) {
                res.status(404).json({ success: false, error: "Image not found." });
                log(`Did not find image with id: "${_id}".`);
            }
        }
    });

    // Serve a file by path/filename
    dbRouter.get("/imageFile", async(req, res) => {
        const { path } = req.query;

        // This should be done differently
        const defaultPath = "/raid/32T/johannes_library/NotesForJess/";
        const fullPath = `${defaultPath}${path}`;

        log (`Looking for file: ${fullPath}`, 'yellow');

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ success: false, error: "Image not found." });
        }
        
        res.sendFile(fullPath)
    })

    // Serve an actual file
    dbRouter.get("/photo", async (req, res) => {
        const { _id } = req.query;

        try {
            const record = await photos.getRecordWithId(_id);
            const imagePath = record.fullname;

            if (!fs.existsSync(imagePath)) {
                return res.status(404).json({ success: false, error: "Image not found." });
            }

            let rotateBy = 0;
            if (record.orientation) {
                rotateBy = (parseInt(record.orientation) - 1) * 90;
            }

            sharp(imagePath)
                .resize({ width: 2400 })
                .rotate(rotateBy)
                .toBuffer()
                .then((data) => {
                    res.contentType("image/jpeg");
                    res.send(data);
                })
                .catch((error) => {
                    console.error("Error processing image:", error);
                    res.status(500).json({ success: false, error: "Internal Server Error." });
                });
        } catch (err) {
            res.status(404).json({ success: false, error: "Image not found." });
            log(`Did not find image with id: "${_id}".`);
        }
    });

    dbRouter.post("/faceData", async (req, res) => {
        const { faceDataRecordId, namesInfo } = req.body;
        if (faceDataRecordId && namesInfo) {
            await photos.storeReferenceFaceData(faceDataRecordId, namesInfo);
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    });

    dbRouter.post("/m2m/pull", async (req, res) => {
        let {
            connectionName, // Optional target database (use default if undefined)
            collectionName, // Target collection
            sessionId, // Optional session identifier
            filter, // Optional Mongo query filter
            orderBy, // Optional sort filter
            settings, // Optional settings (.e.g 'random')
        } = req.body;

        if (!filter) {
            filter = {};
        }

        if (!orderBy) {
            orderBy = {};
        }

        log(
            `Processing request for ${collectionName}, query: ${JSON.stringify(req.query)}, settings: ${JSON.stringify(
                settings
            )}, filter: ${JSON.stringify(filter)}, orderBy: ${JSON.stringify(orderBy)}.`
        );

        const libraryInfo = await photos.getLibraryInfo();
        photos.processFilterForPlaceholders(filter);
        photos.processFilterForUnsortedCollection(filter);
        photos.processFilterForFolderSearch(filter);
        console.log('Filter Resolved',filter.$and)

        libraryInfo.filterSize = await photos.getFilterSize(filter);
        const { fileInfoRecord, cursorIndex } = await photos.getRequestedFileInfoRecord(filter, orderBy, settings?.cursorIndexOffset);

        const latestOps = {
            collectionsLastAddedTo: [...cache.collectionsLastAddedTo],
            lastUsedFilter: filter,
            filterSize: await photos.getFilterSize(req.body.filter),
            cursorIndex,
        };


        let response = {};
        

        response = {
            data: {
                records: [
                    fileInfoRecord,
                ]
            },
            libraryInfo,
            latestOps,
            recordInfo: {
                recordId: fileInfoRecord?._id,
                availableTags: libraryInfo.library?.tags?.filter((tag) => !fileInfoRecord?.tags?.includes(tag)),
            },
        };

        if (fileInfoRecord) {
            cache.lastPulledRecord = { ...fileInfoRecord };      
            log(`Passing back fileInfoRecord ${fileInfoRecord._id} with library info calulated in ${libraryInfo.calculationTime} ms`);
      
        } else {
            log(`Returning error: unable to pull requested image`);
        }
        
        cache.lastUsedFilter = filter;
        cache.cursorIndex = cursorIndex;
        log(`Last Used Filter: ${JSON.stringify(cache.lastUsedFilter)}`);

        res.json(response);
    });

    dbRouter.post("/m2m/push", async (req, res) => {
        const { record, settings } = req.body;
        try {
            let response = {};

            if (settings?.action) {
                // We a custom command.
                await photos.processActionRequest(record, settings, cache.lastUsedFilter);
                log(`Done processing action request`, 'yellow');
            } else {
                // Default: update record.
                await photos.updateFileInfoRecord(record);
                updateCollectionsLastAddedTo(record);
                const prevRecord = _.cloneDeep(cache.lastPulledRecord);
                await photos.syncAllMetaItemsWithFileInfoRecord(record, prevRecord);
            }

            cache.lastPulledRecord = { ...record };

            const libraryInfo = await photos.getLibraryInfo();
            const latestOps = {
                collectionsLastAddedTo: [...cache.collectionsLastAddedTo],
                lastUsedFilter: cache.lastUsedFilter,
                filterSize: await photos.getFilterSize(cache.lastUsedFilter),
                cursorIndex: cache.cursorIndex,
            };

            response = {
                libraryInfo,
                latestOps,
                data: {
                    records: [record]
                },
                recordInfo: {
                    recordId: record._id,
                    availableTags: libraryInfo.library?.tags?.filter((tag) => !record?.tags?.includes(tag)),
                }
            };                                
            //cache.lastUsedFilter = response.filter ? { ...response.filter } : {};
            log(`Last Used Filter: ${JSON.stringify(cache.lastUsedFilter)}`);    

            res.json(response);
        } catch (err) {
            logError(err);
            res.status(500).send();
        }
    });


    return dbRouter;
};



export default initRouter;
