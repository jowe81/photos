import mongoConnect from './db/mongodb.js';
import { getEnhancedCollection } from './db/dbutils.js';

/**
 * FaceAPI demo that loads two images and finds similarity most prominant face in each image
 */

 import fs from 'fs';

 import * as tf from '@tensorflow/tfjs-node'
 
 
 import * as faceapi from '@vladmandic/face-api';
 
 const modelPath = './modules/photos/models'
 let faceDataCollection;

 let optionsSSDMobileNet;
 
 const getDescriptors = async (imageFile) => {
   const buffer = fs.readFileSync(imageFile);
   const tensor = tf.node.decodeImage(buffer, 3);
   const faces = await faceapi.detectAllFaces(tensor, optionsSSDMobileNet)
     .withFaceLandmarks()
     .withFaceDescriptors();
   tf.dispose(tensor);
   return faces.map((face) => face.descriptor);
 };
 
 const main = async (file1, file2) => {
   console.log('input images:', file1, file2); // eslint-disable-line no-console
   await tf.ready();
   await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
   optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 1 });
   await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
   await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
   const d1 = await getDescriptorsFromDb(file1, 1);
   const d2 = await getDescriptorsFromDb(file2, 0);
   console.log(`First set:`);
   console.log(Object.keys(d1), Object.keys(d2));
   console.log(d1['1'], d1['2'], d1['3']);
   console.log(d2['1'], d2['2'], d2['3']);
   const d3 = await getDescriptors(file1);
   const d4 = await getDescriptors(file2);
   const d30 = d3[0];
   const d40 = d4[0];
   console.log(`Second Set`);
   console.log(Object.keys(d30), Object.keys(d40));
   console.log(d30['1'], d30['2'], d30['3']);
   console.log(d40['1'], d40['2'], d40['3']);
   const distance = faceapi.euclideanDistance(d1, d2); // only compare first found face in each image
   console.log('distance between most prominant detected faces:', distance); // eslint-disable-line no-console
   console.log('similarity between most prominant detected faces:', 1 - distance); // eslint-disable-line no-console

   const distance2 = faceapi.euclideanDistance(d3[0], d4[0]); // only compare first found face in each image
   console.log('distance between most prominant detected faces:', distance2); // eslint-disable-line no-console
   console.log('similarity between most prominant detected faces:', 1 - distance2); // eslint-disable-line no-console
  };
 

const getDescriptorsFromDb = async (file, index) => {
  const filter = {file};
  console.log('Waiting for Filter: ', filter)  
  const records = await faceDataCollection.find(filter).toArray();
  
  if (records && records.length) {
    return records[0].faceData[index].faceDescriptor;
  }  
}

 
//main('./assets/ref/jk_jess-johannes_02.jpg', './assets/new/grouse/5M7A8239.jpg');


mongoConnect('test2').then(({db_mongo_database, db}) => {

  console.log(`Connected to database ${db_mongo_database}`);

  faceDataCollection = getEnhancedCollection(db, 'photosFaceData');

  main('assets/ref/jk_jess-johannes_02.jpg', 'assets/new/grouse/5M7A8239.jpg');

});