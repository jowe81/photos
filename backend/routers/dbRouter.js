import { log } from '../helpers/jUtils.js';
import { ObjectId } from 'mongodb';

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
  
  dbRouter.get('/', async (rec, res) => {
    const filesAdded = await photos.addDirectoryToDb('./', 'default', ['.jpg', '.jpeg']);
    res.json({filesAdded});
  });

  dbRouter.get('/random', async (rec, res) => {
    // Return a URL to a random picture.
    try {
        const docs = await photos.getRandomPicture('default');
        

        //res.json(doc);
        //console.log(`doc.fullname: ${doc.fullname}`, doc)
        if (docs.length) {
            const doc = docs[0]
            
            console.log('redirecting', `../${doc.fullname}`);
            res.redirect(`../../${doc.fullname}`)
        }

    } catch (err) {
        res.status(500).send();
    }
  });

  

  return dbRouter;
}

export default initRouter;
