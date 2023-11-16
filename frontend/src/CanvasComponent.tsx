import React, { useRef, useEffect } from "react";

const CanvasComponent = (props: any) => {
    const { boxes, imageDimensions, onClick } = props;
    const canvasRef = useRef(null);
    console.log('CanvasComp', imageDimensions)
    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        // Draw boxes on the canvas
        boxes.forEach((box) => {
            context.fillRect(
                box._x,
                box._y,
                box._width,
                box._height
            );
        });
    }, [boxes]);

    const handleCanvasClick = (event) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Call the function to check if the click is inside any box
        checkIfClickInsideBoxes(x, y);
    };

    const checkIfClickInsideBoxes = (clickX, clickY) => {
        boxes.forEach((box: any, index: number) => {
            if (
                clickX >= box._x &&
                clickX <= box._x + box._width &&
                clickY >= box._y &&
                clickY <= box._y + box._height
            ) {
                // The click is inside the current box
                console.log("Clicked inside box:", box);
                // You can do something here, like calling a callback function
                if (onClick) {
                    onClick(box, index);
                }
            }
        });
    };

    return (
        <canvas
            className="canvas-click-interceptor"
            ref={canvasRef}
            width={imageDimensions?.width}
            height={imageDimensions?.height}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                zIndex: 11,
            }}
            onClick={handleCanvasClick}
        ></canvas>
    );
};

// Example usage
const App = () => {
    const boxes = [
        { x: 50, y: 50, width: 100, height: 50 },
        { x: 200, y: 100, width: 80, height: 120 },
        // Add more boxes as needed
    ];

    const handleRectangleClick = (clickedRectangle) => {
        // Do something when a box is clicked
        console.log("Clicked box:", clickedRectangle);
    };

    return (
        <CanvasComponent
            boxes={boxes}
            onClick={handleRectangleClick}
        />
    );
};

export default CanvasComponent;
