import { useRef, useEffect, useState } from "react";
import "./image.css";

function Image(props: any) {
    const imageUrl = props.fileInfo.fullUrl;
    const fileInfo = props.fileInfo;
    const faceData = props.faceData;
    const canvasRef = useRef(null);
    const imageRef = useRef(null);
    const [imageDimensions, setImageDimensions] = useState({
        width: 0,
        height: 0,
        scale: 1,
    });

    const { scale } = imageDimensions;

    const displayAspect = 1.5;
    const maxWidth = 650;
    const maxHeight = maxWidth / displayAspect;

    useEffect(drawBoxes, [imageDimensions]);

    function drawBoxes() {
        console.log(`Drawing boxes`, imageDimensions);

        const canvas: any = canvasRef.current;
        const context = canvas.getContext("2d");

        // Set the red border color
        context.strokeStyle = "red";

        faceData.forEach((item: any) => {
            console.log("detection: ", Object.keys(item.detection.alignedRect));

            let box;
            if (item.detection?._box) {
                box = item.detection._box;
            } else if (item.detection.detection) {
                // These may not always match
                box = item.detection.detection?._box;
            }

            if (box) {
                const { _x, _y, _width, _height } = box;

                context.strokeRect(
                    _x * scale,
                    _y * scale,
                    _width * scale,
                    _height * scale
                );
            }
        });

        // Draw the red border
    }

    function onImageLoad(event: any) {
        const { naturalWidth, naturalHeight } = event.target;

        const scale = Math.min(
            maxWidth / naturalWidth,
            maxHeight / naturalHeight
        );

        const scaledWidth = Math.round(parseInt(fileInfo.width) * scale);
        const scaledHeight = Math.round(parseInt(fileInfo.height) * scale);

        setImageDimensions({
            width: scaledWidth,
            height: scaledHeight,
            scale,
        });
        console.log(
            `Image loaded, resizing canvas to ${scaledWidth} x ${scaledHeight}`
        );
        const canvas: any = canvasRef.current;
        if (canvas) {
            canvas.width = scaledWidth;
            canvas.height = scaledHeight;
        }
    }

    return (
        <div className="image-and-canvas-container">
            <div className="image-and-canvas" style={{ position: "relative" }}>
                <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Loaded Image"
                    width={imageDimensions.width}
                    height={imageDimensions.height}
                    onLoad={onImageLoad}
                />
                <canvas
                    ref={canvasRef}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                    }}
                    width={imageDimensions.width}
                    height={imageDimensions.height}
                />
            </div>
        </div>
    );
}

export default Image;
