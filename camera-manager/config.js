const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "../config/cameras.json");

function loadCameras() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, "utf8");
            // Strip BOM if present (Fix for Notepad edits)
            const cleanData = data.replace(/^\uFEFF/, '');
            let cameras = [];
            try {
                cameras = JSON.parse(cleanData);
            } catch (e) {
                console.error(`[Config] JSON Parse Error in cameras.json: ${e.message}`);
                return [];
            }

            if (!Array.isArray(cameras)) {
                console.error("[Config] cameras.json is not an array!");
                return [];
            }

            // SANITIZATION ON LOAD (Fix persistent config errors)
            let changed = false;
            const sanitizedCameras = cameras.map(cam => {
                let modified = false;
                const newCam = { ...cam };

                ['ip', 'user', 'pass', 'rtsp', 'rtspHd'].forEach(key => {
                    if (newCam[key] && typeof newCam[key] === 'string' && newCam[key].includes('\\')) {
                        newCam[key] = newCam[key].replace(/\\/g, '');
                        modified = true;
                    }
                });

                if (newCam.streams) {
                    ['main', 'sub'].forEach(k => {
                        if (newCam.streams[k] && typeof newCam.streams[k] === 'string' && newCam.streams[k].includes('\\')) {
                            newCam.streams[k] = newCam.streams[k].replace(/\\/g, '');
                            modified = true;
                        }
                    });
                }

                if (modified) changed = true;
                return newCam;
            });

            if (changed) {
                console.log("[Config] Automatically sanitized cameras.json (removed backslashes).");
                try {
                    fs.writeFileSync(configPath, JSON.stringify(sanitizedCameras, null, 2));
                } catch (e) { console.error("[Config] Failed to write sanitized config:", e.message); }
            }

            return sanitizedCameras;
        }
    } catch (err) {
        console.error("Error loading camera config:", err);
    }
    return [];
}

module.exports = {
    loadCameras,
    reconnectDelay: 3000
};
