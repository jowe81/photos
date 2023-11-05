import "./info.css";

function Info(props: any) {
    const { fileInfo, faceData } = props;

    return (
        <div className="info-container">
            <div>
                <label>File</label>
                <div>{fileInfo.fullname}</div>
                <label>Dimensions</label>
                <div>
                    {fileInfo.width} x {fileInfo.height}
                </div>
                <label>Faces</label>
                <div>{faceData?.length ?? 0}</div>
            </div>
        </div>
    );
}

export default Info;
