const fs = require('fs');
const path = require('path');

const camConfigPath = path.join(__dirname, '../config/cameras.json');
const go2rtcConfigPath = '/opt/dss-edge/go2rtc.yaml';

function updateConfig() {
    try {
        if (!fs.existsSync(camConfigPath)) {
            console.warn("Cameras config not found");
            return;
        }
        const cams = JSON.parse(fs.readFileSync(camConfigPath, 'utf8'));
        let yaml = "streams:\n";

        cams.forEach(c => {
            let mainUrl = c.rtspHd || c.rtsp;
            let subUrl = c.rtsp;

            // Heuristics
            const user = encodeURIComponent(c.user || 'admin');
            const pass = encodeURIComponent(c.pass || '');

            if (c.manufacturer === 'Hikvision') {
                mainUrl = `rtsp://${user}:${pass}@${c.ip}:554/Streaming/Channels/101`;
                subUrl = `rtsp://${user}:${pass}@${c.ip}:554/Streaming/Channels/102`;
            } else if (c.manufacturer === 'Dahua') {
                mainUrl = `rtsp://${user}:${pass}@${c.ip}:554/cam/realmonitor?channel=1&subtype=0`;
                subUrl = `rtsp://${user}:${pass}@${c.ip}:554/cam/realmonitor?channel=1&subtype=1`;
            } else if (c.ip) {
                // Fallback Generic
                if (!mainUrl) mainUrl = `rtsp://${user}:${pass}@${c.ip}:554/live/main`;
                if (!subUrl) subUrl = mainUrl;
            }

            // Write to YAML
            // Use quotes to handle special chars in standard YAML, but Go2RTC handles spaces well mostly.
            // Better wrap in quotes just in case?
            // Go2RTC config is simple key: value

            if (mainUrl) yaml += `  ${c.id}_hd: "${mainUrl}"\n`;
            if (subUrl) yaml += `  ${c.id}: "${subUrl}"\n`;
        });

        fs.writeFileSync(go2rtcConfigPath, yaml);
        console.log("[Go2RTC] Local Config Updated.");
    } catch (e) {
        console.error("[Go2RTC] Update Failed:", e);
    }
}

if (require.main === module) {
    updateConfig();
}

module.exports = updateConfig;
