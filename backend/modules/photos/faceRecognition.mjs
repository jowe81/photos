import * as faceapi from "@vladmandic/face-api";
import * as canvas from "canvas";
import * as tf from "@tensorflow/tfjs-node";
import fs from "fs";

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

async function getFaceFunctions() {
    let optionsSSDMobileNet;

    async function detectFaces(imagePath) {
        // Load the image
        const img = await canvas.loadImage(imagePath);

        // Detect faces in the image
        const detections = await faceapi
            .detectAllFaces(img)
            .withFaceLandmarks()
            .withFaceDescriptors();

        // Create an array of objects with face information
        const faceInfo = detections.map((data, index) => ({
            index,
            data,
        }));

        return faceInfo;
    }

    async function detectFaces2(imageFile) {
        const buffer = fs.readFileSync(imageFile);
        const tensor = tf.node.decodeImage(buffer, 3);
        const faces = await faceapi
            .detectAllFaces(tensor, optionsSSDMobileNet)
            .withFaceLandmarks()
            .withFaceDescriptors();
        tf.dispose(tensor);
        return faces.map((face) => face.descriptor);
    }

    async function recognizeFaces(faceData, referenceFaceData) {
        /**
         * Both arguments have this format:
         * [
         *    {
         *      faceNumber:
         *      descriptor:
         *    }
         * ]
         **/
        return;

        const matchedFaces = [];

        // Go through all the faces found in the image.
        for (const faceInfo of faceData) {
            const { descriptor } = faceInfo.detection;

            // Compare the detected face descriptor with each reference face descriptor
            const distances = referenceFaceData.map((referenceFace) => {
                const referenceFaceDescriptor = dbObjToFloatArray(referenceFace.detection.descriptor);
                return {
                    name: referenceFace.faceId ?? referenceFace.faceNumber,
                    distance: faceapi.euclideanDistance(
                        descriptor,
                        referenceFaceDescriptor
                    ),
                };
            });

            // Sort the distances in ascending order to find the closest match
            distances.sort((a, b) => a.distance - b.distance);

            // The closest match is the one with the smallest distance
            const closestMatch = distances[0];

            // You can set a threshold to determine if it's a valid match
            // Adjust the threshold as needed
            const threshold = 0.6;

            if (closestMatch.distance <= threshold) {
                console.log(Object.keys(closestMatch));
                matchedFaces.push({
                    descriptor,
                    referenceName: closestMatch.name,
                    similarity: 1 - closestMatch.distance,
                });
            }
        }

        return matchedFaces;
    }

    function dbObjToFloatArray(obj) {
        const floatArr = new Float32Array(128);
        Object.keys(obj).forEach((key, index) => {
            //floatArr.push(parseFloat(obj[key]));
            floatArr[index] = parseFloat(obj[key]);
        });
        return floatArr;
    }

    async function initialize() {
        // Load faceapi models
        const modelPath = "./modules/photos/models";
        await tf.ready();
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
        optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({
            minConfidence: 0.5,
            maxResults: 1,
        });
        await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
        await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(modelPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
        await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
    }

    // Init and return function on success.
    try {
        await initialize();

        return {
            detectFaces,
            recognizeFaces,
        };
    } catch (err) {
        return null;
    }
}

export { getFaceFunctions };
