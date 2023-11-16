import { useState, useEffect } from "react";
import "./App.css";

import Editor from "./Editor";

import axios from "axios";

function App() {
    const [count, setCount] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [payload, setPayload] = useState<any>();
    const [fetchData, setFetchData] = useState(false);

    const fileInfo = payload?.fileInfo;
    const faceData = payload?.faceData;
    const personRecords = payload?.personRecords;
    const faceDataRecordId = payload?.faceData?._id;
    const baseUrl = "http://jj-photos.wnet.wn:3020/";
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

    const fetchImageData = () => {
        console.log("Effect fetching")
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
    }

    const refetchImageData = () => {
        console.log('REFETCHING', fetchData)        
        setFetchData(!fetchData);
    }

    useEffect(fetchImageData, [currentIndex, fetchData]);

    const props = {
        baseUrl,
        fileInfo: { ...fileInfo },
        faceData: faceData?.faceData,
        personRecords,
        faceDataRecordId,
        onNextClick: next,
        onPrevClick: prev,
        refetchImageData,
        shouldRedraw: payload,
    };

    return (
        <>
            <Editor {...props} />
            <div>{!fileInfo && fileInfo && JSON.stringify(fileInfo)}</div>
        </>
    );
}

export default App;
