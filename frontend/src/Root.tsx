import { Outlet, Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import './root.css';

export default function Root() {
        
    return (
        <div id="ui-root">
            <div id="topnav-container">
                Welcome to Photos
            </div>
            <div id="main-content-area">
                <Outlet />
            </div>
        </div>
    );
}