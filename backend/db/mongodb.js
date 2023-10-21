import { MongoClient } from 'mongodb';
import { log } from '../helpers/jUtils.js';

let db;

const connect = () => {
  const db_mongo_host = process.env.DB_MONGO_HOST;
  const db_mongo_port = process.env.DB_MONGO_PORT;
  const db_mongo_database = process.env.DB_MONGO_DATABASE;

  const db_url = (db_mongo_host && db_mongo_port) ? 
    `mongodb://${db_mongo_host}:${db_mongo_port}` :
    'mongodb://localhost:27017';

  const client = new MongoClient(db_url);
  
  log(`Connecting to Mongo service at ${db_url}.`);

  return new Promise((resolve, reject) => {
    client.connect()  
    .then((d) => {
      db = client.db(db_mongo_database);
      resolve(db);
    }).catch(err => {
      log('Connection failed. ', null, err);
      reject(err);
    })  
  });
}

export default connect;

const storeUpdateRecord = (collection, record) => {
    console.log('Db handle at storeupload:', db);
}

export { 
    storeUpdateRecord 
};