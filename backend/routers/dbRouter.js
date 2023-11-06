import { log } from '../helpers/jUtils.js';
import { ObjectId } from 'mongodb';
import constants from '../constants.js';
import ExifReader from 'exifreader';

const initRouter = (express, db, photos) => {
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
  
  dbRouter.get('/addAssets/', async (req, res) => {
    const { path } = req.query;

    if (path) {
        const data = await photos.addDirectoryToDb('./' + path);
        res.json({data});    
    }
  });

  dbRouter.get('/randomUrl', async (req, res) => {
    // Return a URL to a random picture.
    try {
        const docs = await photos.getRandomPicture();
        if (docs.length) {
            const doc = docs[0];                    
            res.json({
                ...doc,
                url: constants.baseUrl + '/' + doc.fullname
            });
        }

    } catch (err) {
        console.log(err)
        res.status(500).send();
    }
  });

  dbRouter.get('/randomRedirect', async (req, res) => {
    // Redirect to a random picture.
    try {
        const docs = await photos.getRandomPicture();
        if (docs.length) {
            const doc = docs[0];                    
            res.redirect(`../../${doc.fullname}`)
        }

    } catch (err) {
        res.status(500).send();
    }
  });  

  dbRouter.get('/photo', async (req, res) => {
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
          faceData: fileData.faceData,
          fileInfo: fileData.fileInfo,
          count,
          index,
        }  

        res.json({success: true, data});
      }

    } catch(err) {
      res.status(500).json({success: false, error: err.message});
    }        
  });

  dbRouter.post('/faceData', async (req, res) => {
    const { faceDataRecordId, namesInfo } = req.body;
    if (faceDataRecordId && namesInfo) {
        photos.storeReferenceFaceData(faceDataRecordId, namesInfo);
    }
    res.json(req.body)
  });

  return dbRouter;
}

export default initRouter;
