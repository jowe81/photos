import { useState, useEffect } from "react";
import "./App.css";

import Editor from "./Editor";

import axios from "axios";

function App() {
    const [count, setCount] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [payload, setPayload] = useState<any>();

    const fileInfo = payload?.fileInfo;
    const faceData = payload?.faceData;
    const faceDataRecordId = payload?.faceData?._id;

    const baseUrl = "http://192.168.1.199:3020/";
    if (fileInfo) {
        fileInfo.fullUrl = baseUrl + fileInfo.fullname;
    }

    const next = () => {
        let newIndex;
        if (currentIndex < count - 1) {
            newIndex = currentIndex + 1;
        } else {
            newIndex = 0;
        }

        setCurrentIndex(newIndex);
    };

    const prev = () => {
        let newIndex;
        if (currentIndex > 0) {
            newIndex = currentIndex - 1;
        } else {
            newIndex = count - 1;
        }

        setCurrentIndex(newIndex);
    };

    useEffect(() => {
        axios
            .get(`${baseUrl}db/photo?index=${currentIndex}`)
            .then((data: any) => {
                if (data.data.success) {
                    const payload = data.data.data;
                    setPayload({ ...payload });
                    console.log("Payload", payload);
                    setCount(payload.count);
                }
            })
            .catch((err) =>
                console.warn(
                    `Unable to retrieve fileInfo with index ${currentIndex}`
                )
            );
    }, [currentIndex]);

    const props = {
        baseUrl,
        fileInfo: { ...fileInfo },
        faceData: faceData?.faceData,
        faceDataRecordId,
        onNextClick: next,
        onPrevClick: prev,
    };

    return (
        <>
            <Editor {...props} />
            <div>{!fileInfo && fileInfo && JSON.stringify(fileInfo)}</div>
        </>
    );
}

export default App;
