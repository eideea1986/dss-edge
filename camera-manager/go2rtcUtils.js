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

        const hdUrl = (cam.rtspHd || cam.rtspMain || cam.rtsp || "").split('#')[0].trim();
        const subUrl = (cam.rtspSub || cam.rtsp || "").split('#')[0].trim();

        if (hdUrl) {
            yaml += `  ${cam.id}_hd:\n`;
            yaml += `    - ${hdUrl}\n`;
            yaml += `    - ffmpeg:${hdUrl}#video=h264#hardware\n`;
        }
        if (subUrl) {
            yaml += `  ${cam.id}_sub:\n`;
            yaml += `    - ${subUrl}\n`;
            yaml += `    - ffmpeg:${subUrl}#video=mjpeg\n`;
        }

        if (subUrl) {
            yaml += `  ${cam.id}: [${cam.id}_sub]\n`;
        } else if (hdUrl) {
            yaml += `  ${cam.id}: [${cam.id}_hd]\n`;
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
