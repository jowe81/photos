import Form from "./Form";
import Info from "./Info";
import Image from "./Image";

import "./editor.css";

function Editor(props: any) {
    const { fileInfo } = props;

    if (!fileInfo.fullUrl) {
        return;
    }

    return (
        <div className="editor-container">
            <div className="editor-upper-section">
                {/* <Image {...props}/> */}
                <Image {...props} />
                <Info {...props} />
            </div>
            <Form {...props} />
        </div>
    );
}

export default Editor;
