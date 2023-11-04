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
    console.log(req.body);
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

  dbRouter.post('/curl', async (req, res) => {
    console.log(req.query, req.params, req.body);
    console.log(Object.keys(req));
    console.log(req.rawHeaders, req.baseUrl,req.method);
    res.json({"error":0,"errortext":"","message":"","result":{"ind_first_name":"Nathan","ind_last_name":"Hartmann","ind_preferred_name":"Nate","member_number":"567150","email_address":"zzabsolutelyfakeemail@fakedomain.domzz"},"initiatetime":1697220833.504784,"responsetime":1697220833.840058,"requestid":21552})
  })
  

  return dbRouter;
}

export default initRouter;
