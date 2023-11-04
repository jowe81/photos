
import * as faceapi from '@vladmandic/face-api';
import * as canvas from 'canvas';
import '@tensorflow/tfjs-node';


const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })


async function getRecognizeFacesFunction() {

    async function recognizeFaces(imagePath) {
        // Load the image
        const img = await canvas.loadImage(imagePath);
    
        // Detect faces in the image
        const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
    
        // Create an array of objects with face information
        const faceInfo = detections.map((detection, i) => ({
            faceNumber: i + 1,
            faceDescriptor: detection.descriptor,
        }));
    
        return faceInfo;
    }
    
    async function initialize() {
        // Load faceapi models
        const modelPath = './models'
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath)
        await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath)
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath)
        await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(modelPath)
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath)
        await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath)
    }

    console.log('Initializing FaceApi...');
    try {
        await initialize();
        console.log('...ready.');    

        return recognizeFaces;
    } catch(err) {
        console.log(`Failed to initialize.`);        
    }    

    return null;
}


// // Usage example
// const imagePath = './test.jpg';

// recognizeFaces(imagePath)
//     .then((faces) => {
//         console.log(`Discovered ${faces.length} face(s)`);
//     })
//     .catch((error) => {
//         console.error(error);
//     });

// Export the function if needed
export { getRecognizeFacesFunction };
