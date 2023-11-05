import Form from "./Form";
import Image from "./Image";
import Info from "./Info";

import './editor.css';

function Editor(props: any) {
    const { record } = props;
    console.log(props);
    return(
        <div className="editor-container">
            <div className="editor-upper-section">
                <Image {...props}/>
                <Info {...props} />
            </div>
            <Form {...props}/>
        </div>
    )    
}

export default Editor;