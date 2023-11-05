function Info(props: any) {
    const { record } = props;

    return <div className="info-container">
        <div>
            <label>File</label>
            <div>{record.fullname}</div>            
        </div>
    </div>
}

export default Info;