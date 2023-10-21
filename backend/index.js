import dotenv from 'dotenv';

dotenv.config();

// Project files
import mongoConnect from './db/mongodb.js';
import dbRouter from './routers/dbRouter.js';
import Photos from './modules/Photos.js';
import { log } from './helpers/jUtils.js';

// Packages
import cors from 'cors';
import express from 'express';
import http from 'http';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/assets', express.static('assets'));

const server = http.createServer(app);

const appName = process.env.APP_NAME ?? "JJ Project Backend";
const port = process.env.PORT ?? 3020;

log(`Welcome to ${appName}. Backend is starting up...`);

mongoConnect().then(db => {
  log('Connected to database.');

  const promises = [];

  const photos = Photos(db);

  Promise
    .allSettled(promises)
    .then(() => {
        
      // Initialize the routers.
      app.use('/db', dbRouter(express, db, photos));

      // Start the API server.
      server.listen(port, () => {
        log(`API Server is listening on port ${port}.`);
      })



    });
}).catch(err => {
  log(`Unable to connect to database. Exiting.`, null, err);
});

