import { log } from '../helpers/jUtils.js';
import { ObjectId } from 'mongodb';
import { scanDirectory } from '../modules/scanner.js';
import { addDirectoryToDb } from '../modules/Photos.js';

const initRouter = (express, db) => {
  const castId = obj => obj._id = obj._id ? new ObjectId(obj._id) : null;
  const logError = err => log(`Error: ${err.message}`);

  const dbRouter = express.Router();

  dbRouter.use((err, req, res, next) => {
    logError(err);
    res.status(500).send(err);
    next(err);
  });

  dbRouter.use((req, res, next) => {    
    log(`/post/dbRouter${req.url}`);
    next();
  })
  
  dbRouter.get('/', async (rec, res) => {
    addDirectoryToDb('./', 'default', ['.jpg', '.jpeg', '.png', '.json']);
    const files = scanDirectory('./');
    res.json({'files': files});
  });

  

  return dbRouter;
}

export default initRouter;
