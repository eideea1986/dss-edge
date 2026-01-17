const fs = require('fs');
const { exec } = require('child_process');

function generateConfig(cameras) {
    let yaml = `log:
  level: info

api:
  listen: ":1984"
  origin: "*"

rtsp:
  listen: ":8554"

webrtc:
  listen: ":8555"
  ice_servers: [{urls: ["stun:stun.l.google.com:19302"]}]

streams:
`;

    cameras.forEach(cam => {
        if (cam.enabled === false) return;

        // FORCE TCP TRANSPORT & DISABLE AUDIO BACKCHANNEL
        // This makes the connection stable like the Recorder, fixing UDP packet loss stutter.
        // Support both old and new config formats
        const hdUrlRaw = (cam.rtspHd || cam.rtspMain || (cam.streams && cam.streams.main) || cam.rtsp || "").trim();
        const subUrlRaw = (cam.rtspSub || (cam.streams && cam.streams.sub) || cam.rtsp || "").trim();

        if (hdUrlRaw) {
            // Append suffixes if not present. backchannel=0 prevents audio blocking video. tcp forces interleave.
            const suffix = "#backchannel=0#tcp";
            const hdUrl = hdUrlRaw.includes('#') ? hdUrlRaw + suffix : hdUrlRaw + suffix;
            yaml += `  ${cam.id}_hd: ${hdUrl}\n`;
            // Also map main ID to HD stream
            yaml += `  ${cam.id}: ${hdUrl}\n`;
        }

        if (subUrlRaw) {
            const suffix = "#backchannel=0#tcp";
            const subUrl = subUrlRaw.includes('#') ? subUrlRaw + suffix : subUrlRaw + suffix;
            yaml += `  ${cam.id}_sub: ${subUrl}\n`;

            // If HD is missing, fallback main ID to sub
            if (!hdUrlRaw) {
                yaml += `  ${cam.id}: ${subUrl}\n`;
            }
        }
    });

    const configPath = "/opt/dss-edge/go2rtc.yaml";
    try {
        fs.writeFileSync(configPath, yaml);
        exec("systemctl restart dss-go2rtc", (err) => {
            if (err) console.error(`[Go2RTC] Restart error: ${err.message}`);
        });
    } catch (e) {
        console.error(`[Go2RTC] Config error: ${e.message}`);
    }
}

module.exports = { generateConfig, updateGo2RTC: generateConfig };
