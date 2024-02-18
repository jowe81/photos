import { MongoClient } from 'mongodb';
import { log } from '../helpers/jUtils.js';

let db, clientContainer = {
    mongoConnect: null,
    mongoClient: null,
};

clientContainer.mongoConnect = (dbName) => {
    const db_mongo_host = process.env.DB_MONGO_HOST;
    const db_mongo_port = process.env.DB_MONGO_PORT;
    const db_mongo_database = process.env.DB_MONGO_DATABASE ?? dbName;

    const db_url =
        db_mongo_host && db_mongo_port ? `mongodb://${db_mongo_host}:${db_mongo_port}` : "mongodb://localhost:27017";

    const client = new MongoClient(db_url);
    clientContainer.mongoClient = client;

    log(`Connecting to Mongo service at ${db_url}, using database.`);

    return new Promise((resolve, reject) => {
        client
            .connect()
            .then((d) => {
                db = client.db(db_mongo_database);
                resolve({ db_mongo_database, db, client });
            })
            .catch((err) => {
                log("Connection failed. ", null, err);
                reject(err);
            });
    });
};



export default clientContainer;

const storeUpdateRecord = (collection, record) => {
    console.log('Db handle at storeupload:', db);
}

export { clientContainer, storeUpdateRecord };