const fs = require('fs');
const axios = require('axios');

class Go2RTCService {
    constructor() {
        this.configPath = '/opt/dss-edge/go2rtc.yaml';
    }

    sync(cams) {
        console.log(`[Go2RTC] Syncing ${cams.length} cameras... Full Compatibility Mode.`);

        let yaml = "log:\n  level: info\n\napi:\n  listen: \":1984\"\n  origin: \"*\"\n\nwebrtc:\n  listen: \":8555\"\n\nstreams:\n";

        cams.forEach(cam => {
            if (!cam.enabled) return;

            const mainUrl = cam.rtspMain || cam.rtsp;
            const subUrl = cam.rtspSub;

            if (!mainUrl) return;

            const id = cam.id;

            // 1. STANDARD ID (cam_IP)
            yaml += `  ${id}:\n    - "${mainUrl}"\n`;

            // 2. HD ALIAS (cam_IP_hd) - Required by Live Players
            yaml += `  ${id}_hd:\n    - "${mainUrl}"\n`;

            // 3. SUB/LOW STREAM & ALIASES
            // UI uses _low for snapshots/thumbnails
            if (subUrl && subUrl !== mainUrl) {
                yaml += `  ${id}_sub:\n    - "${subUrl}"\n`;
                yaml += `  ${id}_low:\n    - "${subUrl}"\n`;
            } else {
                // Fallback: If no sub, use main for everything
                yaml += `  ${id}_sub:\n    - "${mainUrl}"\n`;
                yaml += `  ${id}_low:\n    - "${mainUrl}"\n`;
            }
        });

        try {
            fs.writeFileSync(this.configPath, yaml);

            // Reload Config
            axios.post('http://127.0.0.1:1984/api/reload').catch(err => {
                console.warn("[Go2RTC] API Reload warning (might need restart):", err.message);
            });

        } catch (e) {
            console.error("[Go2RTC] Write Failed:", e);
        }
    }
}

module.exports = new Go2RTCService();
