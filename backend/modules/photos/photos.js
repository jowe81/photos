import _ from "lodash";
import constants from "../../constants.js";
import fs from "fs";
import crypto from "crypto";
import ExifParser from "exif-parser";
import ExifReader from "exifreader";
import { performance } from 'perf_hooks';
import { ObjectId } from "mongodb";

import { scanDirectory } from "../scanner.js";
import { parsePath } from "../../helpers/jUtils.js";
import { getEnhancedCollection } from "../../db/dbutils.js";
import { getFaceFunctions } from "./faceRecognition.mjs";

import { log } from "./../Log.js";
import axios from "axios";


async function Photos(dbObject, collectionName) {
    const db = dbObject;

    if (!collectionName) {
        collectionName = constants.defaultCollectionName;
    }

    const collectionNameFileInfo = `${collectionName}FileInfo`;
    const collectionNameFaceData = `${collectionName}FaceData`;
    const collectionNamePeople = `${collectionName}People`;
    const collectionNameDbMeta = `${collectionName}DbMeta`;
    const collectionNameDbMetaItems = `${collectionName}DbMetaItems`;

    const fileInfoCollection = getEnhancedCollection(db, collectionNameFileInfo);
    const faceDataCollection = getEnhancedCollection(db, collectionNameFaceData);
    const peopleCollection = getEnhancedCollection(db, collectionNamePeople);
    const metaCollection = getEnhancedCollection(db, collectionNameDbMeta);
    const metaItemsCollection = getEnhancedCollection(db, collectionNameDbMetaItems);

    const extensions = [".jpg", ".jpeg"];

    log(
        `Initializing Photos module with collections ${collectionNameFileInfo}, ${collectionNameFaceData}, ${collectionNamePeople}.`
    );
    log(`Extensions for processing: ${extensions.join(", ")}`);

    // Initialize facepi
    let detectFaces, recognizeFaces;

    const faceFunctions = await getFaceFunctions();

    if (!faceFunctions) {
        log(`Unable to load FaceApi. Face detection/recognition will not be available.`);
    } else {
        detectFaces = faceFunctions.detectFaces;
        recognizeFaces = faceFunctions.recognizeFaces;

        log(`FaceApi loaded successfully.`);
    }

    async function getCtrlFieldFromDynforms() {
        let ctrlField;

        try {
            const data = await axios.get(`http://johannes-mb.wnet.wn:3010/db/_ctrlField`);
            ctrlField = data.data?.__ctrl;

            log(`New control field: ${JSON.stringify(ctrlField)}`);
        } catch (err) {
            log(`Unable to obtain control field from dynforms.`);
            console.log(err);
        }

        return ctrlField;
    }

    async function addDirectoryToDb(path) {
        const files = scanDirectory(path, extensions);
        const promises = [];

        log(`addDirectoryToDb: Start processing ${files.length} files.`);

        const filesToProcess = files.filter((file) => shouldProcess(file, extensions));
        log(`addDirectoryToDb: Filtered out ${files.length - filesToProcess.length} invalid files.`);

        const filesInfo = await processFilesSequentially(filesToProcess);

        const fileInfoRecordsInserted = filesInfo.filter((fileInfo) => fileInfo.ops.fileInfo === "insert").length;
        const faceDataRecordsInserted = filesInfo.filter((fileInfo) => fileInfo.ops.faceData === "insert").length;

        log(
            `addDirectoryToDb: Added ${fileInfoRecordsInserted} fileInfo records, ${faceDataRecordsInserted} faceData records. Finished.`
        );

        const result = {
            result: {
                fileInfoRecordsInserted,
                faceDataRecordsInserted,
            },
            filesInfo,
        };

        return result;
    }

    async function processFile(file, detectFacesImmediately = false) {
        log(`-- Processing file: ${file}`);

        const existingData = await getDataForFile(file);

        let fileInfo;
        let faceData;
        let ops = {
            fileInfo: null,
            faceData: null,
        };

        if (Object.keys(existingData).length) {
            const presentRecords = [];
            if (existingData.fileInfo) {
                fileInfo = existingData.fileInfo;
                presentRecords.push("fileInfo");
            }
            if (existingData.faceData) {
                faceData = existingData.faceData;
                presentRecords.push("faceData");
            }

            log(`Already have the following: ${presentRecords.join(", ")}`);
        }

        let faceDataId = faceData?._id;

        if (!faceDataId && detectFacesImmediately) {
            // Add a faceData record.
            const faceDataRecord = await processFaces(file);
            if (faceDataRecord) {
                ops.faceData = "insert";
                faceData = faceDataRecord;
                faceDataId = faceDataRecord._id;
            }
        }

        if (!fileInfo) {
            const ctrlField = await getCtrlFieldFromDynforms();

            fileInfo = await new Promise(async (resolve) => {
                let fileInfo;

                fileInfo = getBasicMeta(file, fileInfo);
                fileInfo = await getExifData(file, fileInfo);

                // Add in the ctrl field
                if (ctrlField) {
                    fileInfo.__ctrl = { ...ctrlField };
                }

                // Add the link to face data if we have it.
                if (faceDataId) {
                    fileInfo._faceDataId = faceDataId;
                }

                fileInfo.rating = 0;
                fileInfo.collections = [];

                // Add the main fileInfo record.
                const insertResult = await addFileToDb(fileInfo, collectionName);
                if (insertResult) {
                    ops.fileInfo = "insert";
                }

                // Process collections, tags, folders
                await syncAllMetaItemsWithFileInfoRecord(fileInfo);

                resolve(fileInfo);
            });
        }

        log(`Done with: ${file}`);
        return { ops, fileInfo, faceData };
    }

    async function syncMetaItemsWithFileInfoRecord(newRecord, prevRecord, metaTypeFieldName, metaTypeLabel) {
        const itemsNew = newRecord[metaTypeFieldName] ? [...newRecord[metaTypeFieldName]] : [];
        const itemsNewStringified = JSON.stringify(itemsNew); // Bizarre: using an plain array here results in the array being mutated in the loop below.

        // Need to merge the collections from both before and after in order to both add and remove as needed.
        const itemsToProcess = itemsNew;
        const itemsPrev = prevRecord && prevRecord[metaTypeFieldName] ? [...prevRecord[metaTypeFieldName]] : [];
        itemsPrev.forEach((itemName) => !itemsToProcess.includes(itemName) && itemsToProcess.push(itemName));

        const promises = itemsToProcess.map(async (itemName) => {
            const pictureShouldBeInMetaItem = JSON.parse(itemsNewStringified).includes(itemName);

            /**
             * See if this metaTypeItem exists.
             * If not, create the metaTypeItem.
             *
             * See if the picture should be in it, then add/remove this picture.
             */

            const metaTypeRecord = await metaCollection.findOne({ name: itemName });
            let metaTypeItemId = metaTypeRecord?._id;

            if (!metaTypeItemId) {
                // Create metaTypeItem record.
                const result = await metaCollection.insertOne({
                    type: metaTypeLabel,
                    name: itemName,
                });

                metaTypeItemId = result.insertedId;
            }

            if (!metaTypeItemId) {
                log(`Something went wrong.`, null, "bgRed");
            }
            // Now check if the picture is in the metaType already
            let metaTypeItem = await metaItemsCollection.findOne({
                metaTypeItemId,
                fileInfoId: new ObjectId(newRecord._id),
            });
            const pictureIsCurrentlyInMetaType = !!metaTypeItem;

            if (pictureShouldBeInMetaItem) {
                if (!pictureIsCurrentlyInMetaType) {
                    log(
                        `Added ${metaTypeLabel} '${itemName}': Picture is not yet in ${metaTypeLabel}, adding it.`,
                        null,
                        "yellow"
                    );

                    const result = await metaItemsCollection.insertOne({
                        fileInfoId: new ObjectId(newRecord._id),
                        metaTypeItemId,
                        metaItemName: itemName, // Don't need to store this, just to make dev easier
                        metaTypeLabel, // Don't need to store this, just to make dev easier
                    });
                } else {
                    log(`Added ${metaTypeLabel} '${itemName}': Picture is already in ${metaTypeLabel}.`, null, "green");
                }
            } else {
                if (pictureIsCurrentlyInMetaType) {
                    const result = await metaItemsCollection.deleteOne({ _id: metaTypeItem._id });
                    log(
                        `Removed ${metaTypeLabel} '${itemName}': Picture is currently in ${metaTypeLabel}, removing it.`,
                        null,
                        "yellow"
                    );
                } else {
                    log(`Removed ${metaTypeLabel} '${itemName}': Picture is not in ${metaTypeLabel}.`, null, "green");
                }
            }
        });

        return await Promise.all(promises);
    }

    async function syncFoldersWithFileInfoRecord(record) {
        /**
         * Get folder item from photoDbMeta, create if needed
         * Add photoDbMetaItems record
         */
        if (!record) {
            log(`Missing parameter at syncFoldersWithFileInfoRecord`, null, "bgRed");
            return null;
        }

        let metaRecord = await metaCollection.findOne({ name: record.dirname });

        if (!metaRecord) {
            const result = await metaCollection.insertOne({
                type: "folder",
                name: record.dirname,
            });

            metaRecord = await metaCollection.findOne({ _id: result.insertedId });
        }

        let metaItemsRecord = await metaItemsCollection.findOne({
            fileInfoId: new ObjectId(record._id),
            metaTypeItemId: metaRecord._id,
        });

        if (!metaItemsRecord) {
            const result = await metaItemsCollection.insertOne({
                fileInfoId: new ObjectId(record._id),
                metaTypeItemId: metaRecord._id,
                metaItemName: record.dirname,
                metaTypeLabel: "folder",
            });
        }
    }

    async function syncAllMetaItemsWithFileInfoRecord(record, prevRecord) {
        const promises = [
            syncMetaItemsWithFileInfoRecord(record, prevRecord, "collections", "collection"),
            syncMetaItemsWithFileInfoRecord(record, prevRecord, "tags", "tag"),
            syncFoldersWithFileInfoRecord(record),
        ];

        await Promise.all(promises);
    }

    async function getMetaItemTypeItemCounts(metaTypeFieldName, metaTypeLabel) {
        const metaItems = await metaCollection.find({ type: metaTypeLabel }).toArray();
        const counts = [];
        const promises = metaItems.map(async (metaItemRecord) => {
            let count = await metaItemsCollection.countDocuments({ metaTypeItemId: metaItemRecord._id });
            counts.push({
                item: metaItemRecord.name,
                count,
            });
        });

        await Promise.all(promises);
        return counts.sort((a, b) => (a.item > b.item ? 1 : -1));
    }

    async function getFilterRecord(filter) {
        let record = await metaCollection.findOne({ type: "filter", value: JSON.stringify(filter) });

        if (!record) {
            const result = await metaCollection.insertOne({
                type: "filter",
                value: JSON.stringify(filter),
                cursorIndex: 0,
            });

            record = await metaCollection.findOne({ _id: result.insertedId });
        }

        return record;
    }

    function processFilterForUnsortedCollection(filter) {
        // If the 'unsorted' is in the filter object, we have to adjust internally, making sure we also search for the empty collections array.
        const filterItemToAdjust = filter?.$and?.find(
            (filterItem) => filterItem.collections && filterItem.collections.$in?.includes("unsorted")
        );

        if (filterItemToAdjust) {
            const adjustedFilterItem = {
                $or: [{ collections: filterItemToAdjust.collections }, { collections: { $eq: [] } }],
            };
            delete filterItemToAdjust.collections;
            filterItemToAdjust.$or = adjustedFilterItem.$or;
        }
    }

    function processFilterForFolderSearch(filter) {
        // // If any folders are in the filter, other criteria should be removed.
        // const folderFilter = filter?.$and?.find(filter => filter.dirname);
        // if (folderFilter?.dirname?.$in?.length) {
        //     // Searchin on folders.
        //     filter.$and = [ folderFilter ];
        // }
    }

    function processFilterForPlaceholders(filter) {
        processFilterObject(filter, processFilterValue);
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

    async function processActionRequest(record, settings, lastUsedFilter) {
        switch (settings?.action) {
            case "applyToAllPicturesInSelectedFolders":
                const dirnameFilter = lastUsedFilter?.$and?.find((filterItem) => filterItem.dirname);
                await applyItemsSelectionToMany(record, settings, dirnameFilter);
                break;
        }
    }

    async function applyItemsSelectionToMany(record, settings, filter) {
        const itemType = settings?.itemType;
        if (!itemType) {
            log(`Cannot apply items selection to many: no item type present.`, null, "bgRed");
        } else if (!filter) {
            log(`Cannot apply items selection to many ${itemType}: no filter present.`, null, "bgRed");
        } else if (!record) {
            log(`Cannot apply items selection to many ${itemType}: no reference record found.`, null, "bgRed");
        } else {
            log(`Applying ${itemType} ${record[itemType]?.join(", ")} to records in filter ${JSON.stringify(filter)}`);
            const docs = await fileInfoCollection.find(filter).toArray();
            const promises = docs?.map(async (doc) => {
                const prevRecord = _.cloneDeep(doc);
                doc[itemType] = record[itemType];
                await updateFileInfoRecord(doc);
                await syncAllMetaItemsWithFileInfoRecord(doc, prevRecord);
                log(`Updated ${doc._id}`, null, "yellow");
            });

            if (!promises) {
                log(`No pictures appeared to match the filter.`, null, "yellow");
                return;
            }

            await Promise.all(promises);
            log(`Adjusted ${promises.length} pictures.`, null, "yellow");
        }
    }

    async function updateFileInfoRecord(record) {
        if (record?.collections) {
            // Sanity
            if (record.collections.includes("trashed")) {
                record.collections = ["trashed"];
            }

            // It's being updated but not deleted; make sure it's in general.
            if (record.collections[0] !== "trashed") {
                if (!record.collections.includes("general")) {
                    record.collections.push("general");
                }
            }
        } else {
            record.collections = [];
        }

        const result = await fileInfoCollection.updateOne({ _id: new ObjectId(record._id) }, record);
    }

    async function updateFilterRecord(filterRecord) {
        if (!filterRecord && filterRecord._id) {
            return null;
        }

        let result = await metaCollection.updateOne({ _id: filterRecord._id }, filterRecord);
    }

    async function getRequestedFileInfoRecord(filter, orderBy, offsetFromCurrent) {
        log(`Looking for next: ${JSON.stringify(filter)}, order: ${JSON.stringify(orderBy)}`, null, "bgBlue");

        const filterRecord = await getFilterRecord(filter);
        if (!filterRecord) {
            log(`Filter record not found for ${JSON.stringify(filter)}. Resetting cursor.`, "bgRed");
        }

        if (!offsetFromCurrent) {
            offsetFromCurrent = 0;
        }
        // Execute the filter, get the records
        const filteredCount = await fileInfoCollection.countDocuments(filter);

        let newCursorIndex = filterRecord ? filterRecord.cursorIndex + offsetFromCurrent : 0;

        // This does not yet support flipping multiple times (skip larger numbers of images)
        if (newCursorIndex < 0) {
            // Flip backwards
            newCursorIndex = filteredCount + newCursorIndex;
        } else if (newCursorIndex >= filteredCount) {
            // Flip forwards
            newCursorIndex = newCursorIndex - filteredCount;
        }

        // There are still cases where this happens.
        if (isNaN(newCursorIndex) || newCursorIndex > filteredCount - 1 || newCursorIndex < 0) {
            newCursorIndex = 0;
        }
        log(
            `filteredCount: ${filteredCount}, current cursorIndex: ${filterRecord.cursorIndex}, offset: ${offsetFromCurrent}, new cursorIndex: ${newCursorIndex}`
        );

        let fileInfoRecord;
        const fileInfoRecordArray = await fileInfoCollection.find(filter).sort(orderBy).skip(newCursorIndex).toArray();
        if (fileInfoRecordArray?.length) {
            fileInfoRecord = fileInfoRecordArray[0];
        }

        await updateFilterRecord({
            ...filterRecord,
            cursorIndex: newCursorIndex,
        });

        if (fileInfoRecord?._id) {
            fileInfoRecord.url = `${process.env.APP_URL}/db/photo?_id=${fileInfoRecord._id}`;
            log(`Found: ${fileInfoRecord._id}, ${fileInfoRecord.url}`);
        }

        return {
            fileInfoRecord,
            cursorIndex: newCursorIndex,
        };
    }

    // Asynchronous function to process all files sequentially
    async function processFilesSequentially(filenames) {
        const filesInfo = [];
        for (const filename of filenames) {
            filesInfo.push(await processFile(filename));
        }

        return filesInfo;
    }

    function shouldProcess(file = "", extensions = [".jpg", ".jpeg"]) {
        const { extension, filename, dirname } = parsePath(file);

        if (!(filename.substr(0, 1) !== "." && extensions.includes(extension))) {
            return false;
        }

        return true;
    }

    function getBasicMeta(file = "", fileInfo = {}) {
        if (!file) {
            return fileInfo;
        }

        const { extension, filename, dirname } = parsePath(file);
        const { size, uid, gid } = fs.statSync(file);

        const { tags, date } = getTagsAndDateFromFilePath(file);

        fileInfo = {
            ...{
                fullname: file,
                extension,
                filename,
                dirname,
                size,
                uid,
                gid,
                tags,
                date,
                fingerPrint: getFingerPrint(file),
            },
        };

        log(`Got basic meta for ${file}`);
        return fileInfo;
    }

    async function getFingerPrint(file) {
        return await calculateMD5(file);
    }

    function calculateMD5(filePath) {
        return new Promise((resolve, reject) => {
            // Create a hash object
            const hash = crypto.createHash("md5");
            const stream = fs.createReadStream(filePath);

            stream.on("data", function (data) {
                hash.update(data, "utf8");
            });

            stream.on("end", function () {
                // Calculate digest
                const md5 = hash.digest("hex");
                resolve(md5);
            });

            stream.on("error", function (err) {
                reject(err);
            });
        });
    }

    function getTagsAndDateFromFilePath(file) {
        // (?=[\d- ]{6}) positive lookahead to ensure there are at least 6 characters in the match.
        // This will grab the directory name that has the date.
        let match, dateStr, keywordsStr;

        const dirnamePattern = /(?=[\d- ]{6})(\d+[- ]?\d+[- ]?\d+)([^\/]*)/g;
        if ((match = dirnamePattern.exec(file))) {
            dateStr = match[1];
            keywordsStr = match[2];
        }

        if (keywordsStr) {
            keywordsStr = keywordsStr.trim();
        }

        const date = dateStr ? new Date(dateStr) : null;
        let tags = keywordsStr ? keywordsStr.split(" ") : [];

        if (tags.length === 1) {
            // Only one word; see if there's multiple without spaces (i.e. catch something like: SnowInVancouver)
            if (/^[a-zA-Z0-9]+$/.test(keywordsStr)) {
                // Alphanumeric only
                const words = keywordsStr.split(/(?=[A-Z])/);
                if (words.length > 1) {
                    tags = words;
                }
            }
        }

        return {
            tags: filterTags(tags),
            date: isNaN(date) ? null : date,
        };
    }

    /**
     * Remove some tags
     */
    function filterTags(tags) {
        if (!(tags && tags.length)) {
            return [];
        }

        const excludeTags = ["and", "at", "edits", "edit", "for", "from", "in", "of", "on", "the", "to", "with"];

        return tags
            .map((tag) => tag.toLowerCase())
            .filter((tag) => {
                const isAlpha = /^[a-zA-Z]+$/.test(tag);
                return !excludeTags.includes(tag) && isAlpha;
            });
    }

    function getExifData(file = "", fileInfo = {}) {
        return new Promise((resolve) => {
            if (!file) {
                resolve(fileInfo);
            }

            try {
                const buffer = fs.readFileSync(file);
                const parser = ExifParser.create(buffer);

                const tags = parser.parse();

                fileInfo.width = tags?.imageSize?.width;
                fileInfo.height = tags?.imageSize?.height;
            } catch (err) {
                console.log(err.message);
            }

            ExifReader.load(file)
                .then((data) => {
                    const tags = data;
                    // Convert the date-time info to a JS parseable string.
                    const convertDateTime = (dateTimeRaw) => {
                        const parts = dateTimeRaw.split(" ");
                        const date = parts[0].replaceAll(":", "-");
                        const time = parts[1];
                        return date + " " + time;
                    };

                    const exifData = {
                        width: fileInfo.width ?? tags["Image Width"]?.value,
                        height: fileInfo.height ?? tags["Image Height"]?.value,
                        exifDate: convertDateTime(
                            tags["DateTimeOriginal"]?.value[0] ?? tags["DateTimeDigitized"]?.value[0] ?? ""
                        ),
                        device: {
                            make: tags["Make"]?.value,
                            model: tags["Model"]?.value,
                        },
                        orientation: tags["Orientation"]?.value,
                    };

                    if (exifData.exifDate) {
                        const exifDateObj = new Date(exifData.exifDate);
                        if (!isNaN(exifDateObj)) {
                            // Since we have an exif date, override the date that may have been derived from the file path.
                            fileInfo.date = exifDateObj;
                        }
                    }

                    if (exifData.width && exifData.height) {
                        fileInfo.aspect = exifData.width / exifData.height;
                    }

                    fileInfo = {
                        ...fileInfo,
                        ...exifData,
                    };

                    log(`Got exif data for ${file}`);

                    resolve(fileInfo);
                })
                .catch((err) => {
                    log(`Exif-Error: ${file} ${err.message}`);
                    resolve(fileInfo);
                });
        });
    }

    async function processFaces(file) {
        const faceData = await getFaceData(file);

        // If we have face data, add a faceData record and return it.
        if (faceData) {
            const faceDataRecord = {
                fullname: file,
                faceData,
            };

            const faceDataCollection = getEnhancedCollection(db, collectionNameFaceData);
            let result;

            try {
                await faceDataCollection.insertOne(faceDataRecord, null);
                log(
                    `${faceDataRecord.faceData.length} faces found; added facedata record with id ${faceDataRecord._id}.`
                );
            } catch (err) {
                // Couldn't insert.
            }

            // If the insert was successful, faceDataRecord now has an _id field.
            if (faceDataRecord._id) {
                return faceDataRecord;
            }
        }

        return null;
    }

    async function getFaceData(file = "") {
        if (!detectFaces) {
            log(`Unable to run face recognition, skipping.`);
            return null;
        }

        let faceData;

        try {
            faceData = await detectFaces(file);
        } catch (err) {
            console.log(err);
        }

        return faceData;
    }

    async function storeReferenceFaceData(faceDataRecordId, namesInfo = []) {
        if (!faceDataRecordId || !namesInfo.length) {
            return null;
        }

        // Make sure the indices are numbers.
        namesInfo.forEach((nameinfo, index) => (namesInfo[index].index = parseInt(namesInfo[index].index)));

        // Retrieve the faceDataRecord
        const faceDataRecord = await faceDataCollection.findFirst({ _id: new ObjectId(faceDataRecordId) });

        if (!faceDataRecord) {
            log(`Error: FaceDataRecord ${faceDataRecordId} is missing!`);
            return;
        }

        /**
         * Go through each object in namesInfo, and
         * - retrieve or create a people record
         * - check if the descriptor from faceDataRecordId is already present
         * - if it's not: add it, and conversely put a personRecordId on the faceInfo in faceDataRecord
         */

        for (const nameInfo of namesInfo) {
            const { index, firstName, lastName } = nameInfo;

            if (!firstName || !lastName) {
                // Nothing to do - no actual information was sent.
                log(`Skipping nameInfo ${index}, it has no data.`);
                continue;
            }

            const fullName = `${firstName} ${lastName}`;
            log(`Processing data for ${fullName}.`);

            // See if we have a record for the person referenced.
            let personRecord = await peopleCollection.findFirst({ fullName });

            // Create if not exists.
            if (!personRecord) {
                personRecord = {
                    fullName,
                    firstName,
                    lastName,
                    faceDescriptors: [],
                };

                await peopleCollection.insertOne(personRecord);
            }

            // Find the descriptor for this person on the faceDataRecord
            const detectionOnFaceDataRecord = faceDataRecord.faceData.find((item) => item.index === index);

            // See if this descriptor already exists on the person.
            const existingDescriptor = personRecord.faceDescriptors.find((faceDescriptorObject) => {
                return faceDescriptorObject.faceDataRecordId.toString() === faceDataRecordId;
            });

            if (!existingDescriptor) {
                // Make a copy for the person record, with a reference to where it came from.
                const faceDescriptorObject = {
                    faceDataRecordId: new ObjectId(faceDataRecordId),
                    ...detectionOnFaceDataRecord,
                };

                // Do not store the personRecordId.
                delete faceDescriptorObject.personRecordId;

                personRecord.faceDescriptors.push(faceDescriptorObject);
                await peopleCollection.mUpdateOne({ _id: personRecord._id }, personRecord);

                log(`Added face descriptor to ${fullName}. They now have ${personRecord.faceDescriptors.length}.`);
            } else {
                // Nothing to do.
                log(`Provided faceDescriptor already exists for ${fullName} - not updating their person record.`);
            }

            // Mark this on the faceDataRecord as a reference descriptor for this person.
            detectionOnFaceDataRecord.isReferenceDescriptor = true;
            detectionOnFaceDataRecord.isManuallySet = true;
            detectionOnFaceDataRecord.personRecordId = personRecord._id;
            await faceDataCollection.mUpdateOne({ _id: faceDataRecord._id }, faceDataRecord);

            log(`Updated faceDataRecord ${faceDataRecord._id}, marking this descriptor as reference to ${fullName}.`);
        }
    }

    /**
     * Purge records for files that are no longer present.
     */
    async function purgeMissingFiles() {
        let fileInfoRecords;

        try {
            fileInfoRecords = await fileInfoCollection.find({ missingAt: { $exists: true } }).toArray();
            log(`Purging records for ${fileInfoRecords.length} missing files.`);
        } catch (err) {
            log(
                `Error: Encountered an error while attempting to purge records for missing files: ${err.message}. Aborting.`,
                "red"
            );
            return;
        }

        const missingCount = fileInfoRecords.length;

        for (let i = 0; i < missingCount; i++) {
            const fileInfoRecord = fileInfoRecords[i];
            const faceDataRecordId = fileInfoRecord._faceDataId;
            log(`-- Removing data for fileInfoRecord ${fileInfoRecord._id} --`);
            if (faceDataRecordId) {
                const filter = { _id: new ObjectId(faceDataRecordId) };
                const faceDataRecord = await faceDataCollection.findFirst(filter);

                if (faceDataRecord) {
                    try {
                        await faceDataCollection.deleteOne(filter);
                        log(`Removed connected faceDataRecord ${faceDataRecordId}`);
                        /**
                         * Note:
                         *  Reference-descriptors in peopleCollection are not currently deleted when their source image is purged.
                         *  This should probably be implemented.
                         */
                    } catch (err) {
                        log(`Error: ${err.message} Could not remove faceDataRecord ${faceDataRecordId}.`);
                    }
                }
            }

            await fileInfoCollection.deleteOne({ _id: fileInfoRecord._id });
            log(`Removed fileInfoRecord ${fileInfoRecord._id}`);
        }
    }
    /**
     * Check if the file described by the fileInfo record exists in the filesystem.
     * Set fileInfo.missingAt  accordingly.
     */
    async function validateFile(fileInfo) {
        if (typeof fileInfo !== "object") {
            return null;
        }

        const previouslyMissing = fileInfo.missingAt;
        const currentlyMissing = !fs.existsSync(fileInfo.fullname);

        if (!previouslyMissing && currentlyMissing) {
            // It has newly gone missing.
            fileInfo.missingAt = new Date();
            await fileInfoCollection.mUpdateOne({ _id: fileInfo._id }, fileInfo);
        }

        if (previouslyMissing && !currentlyMissing) {
            // It has newly been rediscovered.
            delete fileInfo.missingAt;
            await fileInfoCollection.mUpdateOne({ _id: fileInfo._id }, fileInfo);
        }

        return fileInfo.missingAt;
    }

    /**
     * Get an object with fileInfo and faceData record, if present.
     */
    async function getDataForFile(file) {
        let data = {};

        try {
            // See if we have a fileInfo record.
            const records = await fileInfoCollection.find({ fullname: file }).toArray();
            if (records.length) {
                data.fileInfo = records[0];
            }

            validateFile(data.fileInfo);

            // See if we have face data.
            const faceDataRecord = await faceDataCollection.findFirst({ fullname: file });
            if (faceDataRecord) {
                // Found face data.
                data.faceData = { ...faceDataRecord };

                // Get ids of people referenced in the faceData and pull the records.
                const personRecordIds = faceDataRecord.faceData.map((item) => item.personRecordId);
                data.personRecords = await peopleCollection.find({}).toArray();
                data.personRecords.sort((a, b) => {
                    const composedA = a.lastName + a.firstName;
                    const composedB = b.lastName + b.firstName;

                    return composedA > composedB ? 1 : -1;
                });
            }

            return data;
        } catch (err) {
            console.log(err);
        }

        return data;
    }

    async function getFaceDataRecord(_id) {
        return await faceDataCollection.findFirst({ _id: new ObjectId(_id) });
    }

    async function updateFaceDataRecord(record) {
        return await faceDataCollection.mUpdateOne({ _id: record._id }, record);
    }

    async function getPersonRecords(filter = {}) {
        return await peopleCollection.find({}).toArray();
    }

    /**
     * See if the descriptor is referenced by a person and return the record if so.
     */
    async function getReferencingPersonRecord(faceDescriptor) {}

    async function recognizeFacesInFile(fileData, personRecords) {
        const faceDataRecord = fileData.faceData;
        const { faceData } = faceDataRecord;
        if (!Array.isArray(faceData) || !Array.isArray(personRecords)) {
            return null;
        }

        const result = [];

        for (let h = 0; h < faceData.length; h++) {
            for (let i = 0; i < personRecords.length; i++) {
                const personRecord = personRecords[i];
                const referenceFaceDescriptorItems = personRecord.faceDescriptors;

                if (!Array.isArray(personRecord.faceDescriptors)) {
                    // Have no reference for this person.
                    continue;
                }

                const match = await recognizeFaces(faceData[h], personRecord);

                if (match) {
                    result.push({
                        testFaceIndex: h,
                        ...match,
                    });
                }
            }
        }

        fileData.matchInfo = {
            faceDataRecordId: faceDataRecord._id,
            matches: [...result],
            result,
        };

        return result;
    }

    async function addFileToDb(fileInfo, collectionName = constants.defaultCollectionName) {
        let result;
        try {
            result = await fileInfoCollection.insertOne(fileInfo, null, ["fullname"]);
            log(`Added fileInfo record with id ${fileInfo._id}`);
        } catch (err) {
            console.log(err);
        }

        return result;
    }

    async function getRandomPicture(collectionName = constants.defaultCollectionName) {
        let result;
        try {
            result = await fileInfoCollection
                .aggregate([{ $match: { missingAt: { $exists: false } } }, { $sample: { size: 1 } }])
                .toArray();
        } catch (err) {
            console.log(err);
        }

        return result;
    }

    async function getCount(filter) {
        let count = -1;

        try {
            if (typeof filter === "object") {
                count = await fileInfoCollection.find(filter).countDocuments();
            } else {
                count = await fileInfoCollection.countDocuments();
            }
        } catch (err) {
            console.log(err);
        }

        return count;
    }

    async function getRecords(filter = {}) {
        try {
            return await fileInfoCollection.find(filter).toArray();
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    async function getRecordWithId(_id) {
        const records = await getRecords({ _id: new ObjectId(_id) });
        return records.length ? records[0] : null;
    }

    async function getRecordWithIndex(index = 0) {
        try {
            index = parseInt(index);
            const records = await fileInfoCollection.find({}).skip(index).limit(1).toArray();
            const record = records.length ? records[0] : null;
            return record;
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    async function getDataForFileWithIndex(index = 0) {
        try {
            index = parseInt(index);
            const record = await getRecordWithIndex(index);
            let data = record;
            if (record) {
                data = await getDataForFile(record.fullname);
            }

            return data;
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    async function getFilterSize(filter) {
        const filterSize = await fileInfoCollection.countDocuments(filter);
        return filterSize;
    }

    async function getLibraryInfo() {
        const startTime = performance.now();
        const libraryInfo = {};

        libraryInfo.collections = await getMetaItemTypeItemCounts("collections", "collection");
        await addDefaultCollectionsInfoToLibraryInfo(libraryInfo);

        libraryInfo.photosCount = await getTotalDocumentCount();
        libraryInfo.folders = await getMetaItemTypeItemCounts("dirname", "folder");

        addLabelsToFoldersInfo(libraryInfo.folders);
        libraryInfo.folders.sort((a, b) => (a.label > b.label ? -1 : 1));

        libraryInfo.tags = await getMetaItemTypeItemCounts("tags", "tag");

        const endTime = performance.now();
        libraryInfo.calculationTime = endTime - startTime;

        return libraryInfo;
    }

    async function addDefaultCollectionsInfoToLibraryInfo(libraryInfo) {
        const defaultCollectionNames = ["trashed", "unsorted"];

        // Trashed
        let existingInfo = libraryInfo.collections.filter((collectionInfo) => collectionInfo.item === "trashed");
        if (!existingInfo.length) {
            libraryInfo.collections.push({ item: collectionName, count: 0 });
        }

        // Unsorted
        libraryInfo.collections.push({
            item: "unsorted",
            count: await fileInfoCollection.countDocuments({ collections: { $eq: [] } }),
        });
    }

    function addLabelsToFoldersInfo(foldersInfo) {
        foldersInfo?.forEach((folderInfo) => {
            const baseDisplay = trimHiddenPartFromFolderPath(folderInfo.item);
            const parts = baseDisplay?.split("/");

            // Try to find the main folder name. It should have a date of some sort.
            let mainName;

            parts.every((part, index) => {
                if (/^\d{2,}[^A-Za-z]+[A-Za-z]+/.test(part)) {
                    mainName = part;
                    return false;
                }

                return true;
            });

            folderInfo.label = mainName ?? baseDisplay;
            folderInfo.long = baseDisplay;
        });
    }

    function trimHiddenPartFromFolderPath(fullPath) {
        const envVar = process.env.PATH_PARTS_TO_HIDE_IN_FOLDER_LABELS ?? "";
        const partsToHide = envVar.split(",");

        if (!partsToHide) {
            return fullPath;
        }

        let trimmed = fullPath;

        // Order by longest first to avoid unexpected results
        partsToHide
            .sort((a, b) => (a?.length > b?.length ? -1 : 1))
            .every((part) => {
                if (fullPath.substring(0, part.length)) {
                    trimmed = fullPath.substring(part.length);
                    return false;
                }
                return true;
            });

        return trimmed;
    }

    async function getTags() {
        try {
            const tagsInfo = await fileInfoCollection
                .aggregate([{ $unwind: "$tags" }, { $group: { _id: "$tags" } }, { $project: { tags: 0 } }])
                .toArray();

            return tagsInfo.map((info) => info._id).sort();
        } catch (err) {
            log(`Could not retrieve tags: ${err.message}`, null, "red");
            return [];
        }
    }

    async function getTotalDocumentCount() {
        try {
            return await fileInfoCollection.countDocuments({});
        } catch (err) {
            log(`Could not get a document count for the entire library: ${err.message}`, null, "red");
            return {};
        }
    }

    async function getArrayItemsWithCounts(propertyName) {
        try {
            const items = await collectItemsFromArrays(propertyName);

            const promises = items.map(async (item) => {
                return fileInfoCollection.countDocuments({
                    [propertyName]: { $in: [item] },
                });
            });

            const counts = await Promise.all(promises);

            const itemsCounts = items.map((item, index) => {
                return {
                    item,
                    count: counts[index],
                };
            });

            return itemsCounts;
        } catch (err) {
            log(`Could not retrieve ${propertyName} counts: ${err.message}`, null, "red");
            return {};
        }
    }

    async function collectItemsFromArrays(propertyName) {
        try {
            const propertyInfo = await fileInfoCollection
                .aggregate([
                    { $unwind: `$${propertyName}` },
                    { $group: { _id: `$${propertyName}` } },
                    { $project: { propertyName: 0 } },
                ])
                .toArray();

            return propertyInfo.map((info) => info._id).sort();
        } catch (err) {
            log(`Could not retrieve ${propertyName}: ${err.message}`, null, "red");
            return [];
        }
    }

    async function getCollectionCounts() {
        try {
            const collectionNames = await getCollectionNames();

            const promises = collectionNames.map(async (collectionName) => {
                return fileInfoCollection.countDocuments({
                    collections: { $in: [collectionName] },
                });
            });

            const counts = await Promise.all(promises);

            const collectionCounts = collectionNames.map((collectionName, index) => {
                return {
                    item: collectionName,
                    count: counts[index],
                };
            });

            // Get a count for unsorted pictures, i.e. those in no collection at all.
            const unsortedCount = await fileInfoCollection.countDocuments({
                collections: { $eq: [] },
            });

            collectionCounts.push({
                item: "unsorted",
                count: unsortedCount,
            });

            return collectionCounts;
        } catch (err) {
            log(`Could not retrieve collection counts: ${err.message}`, null, "red");
            return {};
        }
    }

    async function getCollectionNames() {
        try {
            const collectionNamesInfo = await fileInfoCollection
                .aggregate([
                    { $unwind: "$collections" },
                    { $group: { _id: "$collections" } },
                    { $project: { collections: 0 } },
                ])
                .toArray();

            return collectionNamesInfo.map((info) => info._id);
        } catch (err) {
            log(`Could not retrieve collection names: ${err.message}`, null, "red");
            return [];
        }
    }

    async function getArrayItems(fieldName) {
        try {
            const itemsInfo = await fileInfoCollection
                .aggregate([
                    { $unwind: `$${fieldName}` },
                    { $group: { _id: `$${fieldName}` } },
                    { $project: { [fieldName]: 0 } },
                ])
                .toArray();

            return itemsInfo.map((info) => info._id);
        } catch (err) {
            log(`Could not retrieve tag ${fieldName}s: ${err.message}`, null, "red");
            return [];
        }
    }

    return {
        addDirectoryToDb,
        getRandomPicture,
        getArrayItems,
        getCollectionNames,
        getCount,
        getDataForFileWithIndex,
        getFaceDataRecord,
        getFingerPrint,
        getRequestedFileInfoRecord,
        updateFaceDataRecord,
        updateFileInfoRecord,
        getFilterSize,
        getPersonRecords,
        getRecords,
        getRecordWithId,
        getRecordWithIndex,
        storeReferenceFaceData,
        recognizeFacesInFile,
        processActionRequest,
        processFaces,
        processFilterForFolderSearch,
        processFilterForPlaceholders,
        processFilterForUnsortedCollection,
        syncMetaItemsWithFileInfoRecord,
        syncAllMetaItemsWithFileInfoRecord,
        purgeMissingFiles,
        getFilterRecord,
        getLibraryInfo,
    };
}

export default Photos;
