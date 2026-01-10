const fs = require('fs');
const { exec, spawn } = require('child_process');
const path = require('path');

// Helper to log or debug
function logDebug(msg) {
    const time = new Date().toISOString();
    try { fs.appendFileSync("/opt/dss-edge/camera_manager.log", `[${time}] ${msg}\n`); } catch (e) { }
}

function updateGo2RTC(cameras) {
    logDebug('Generating High-Performance Mainstream Config (12FPS)...');

    let yaml = `log:
  level: info

api:
  listen: ":1984"
  origin: "*"

rtsp:
  listen: ":8554"
  packet_buffer_size: 2048

webrtc:
  listen: ":8555"
  ice_servers: [{urls: ["stun:stun.l.google.com:19302"]}]

streams:
`;

    cameras.forEach(cam => {
        if (cam.enabled === false) return;

        let rawUrl = (cam.rtspHd || cam.rtspMain || cam.rtsp || "").split('#')[0].trim();
        if (!rawUrl) return;

        // SMART MAINSTREAM DERIVATION
        let main = rawUrl;
        if (cam.manufacturer === "Hikvision") {
            main = rawUrl.replace("/102", "/101").replace("/Streaming/Channels/2", "/Streaming/Channels/1");
        } else if (cam.manufacturer === "Dahua") {
            main = rawUrl.replace("subtype=1", "subtype=0");
        } else if (cam.manufacturer === "Trassir") {
            main = rawUrl.replace("/sub", "/main");
        }

        // 1. HD RAW (0% CPU - Used for recording reference and direct high-end links)
        yaml += `  ${cam.id}_hd: ${main}#transport=tcp\n`;

        // 2. FULL (WebRTC + Fallback) - Highest quality for full view
        yaml += `  ${cam.id}_full:\n`;
        yaml += `    - ${main}#transport=tcp\n`;
        yaml += `    - ffmpeg:${main}#transport=tcp#video=h264#hardware\n`;

        // 3. GRID (Small Image) - Derived from Mainstream at 12fps as requested
        // Using high quality q=2
        yaml += `  ${cam.id}_sub: ffmpeg:${main}#transport=tcp#video=mjpeg#fps=12#q=2\n`;

        // 4. Default Alias points to Sub for performance in multi-view
        yaml += `  ${cam.id}: ${cam.id}_sub\n`;
    });

    const configPath = "/opt/dss-edge/go2rtc.yaml";
    try {
        fs.writeFileSync(configPath, yaml);
        exec("systemctl reload-or-restart dss-go2rtc", (err) => {
            if (err) logDebug(`Go2RTC Reload Error: ${err.message}`);
            else logDebug("Go2RTC Config Updated & Dynamic Reload Success.");
        });
    } catch (e) {
        logDebug(`Config File Write Error: ${e.message}`);
    }
}

// ... existing code ...
module.exports = { updateGo2RTC };
