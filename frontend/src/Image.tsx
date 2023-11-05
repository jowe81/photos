import './image.css';

function Image(props: any) {
    const { record, baseUrl } = props;

    if (!record.fullname) {
        return;
    }

    const src = baseUrl + record.fullname;

    return <div className="image-container"><img src={src} /></div>
    
}

export default Image;