import axios from "axios";

// Use relative path or detect Proxy base
let baseURL = "";
if (typeof window !== 'undefined') {
    // Check for proxy in full URL (HashRouter compatibility)
    const match = window.location.href.match(/(\/api\/proxy\/[^\/]+)/);
    if (match) {
        baseURL = match[1];
    } else if (window.location.hash.includes("#/")) {
        // Fallback for local dev or direct access
        baseURL = "";
    }
}

const API = axios.create({
    baseURL: baseURL
});

export { API, baseURL };
export default API;
