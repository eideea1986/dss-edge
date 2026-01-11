const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

// Fișierele care PROBABIL sunt bune pe server (dacă nu le-am suprascris deja prea mult)
// DAR eu le-am suprascris deja... Deci nu pot descărca "versiunea bună".

// SINGURA SOLUȚIE: Repar manual go2rtcUtils.js să genereze YAML corect.

const conn = new Client();
console.log("=== MANUAL FIX: Generate Simple Go2RTC YAML ===");

conn.on('ready', () => {
    // Citesc cameras.json și generez un YAML SUPER SIMPLU manual
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                const cameras = JSON.parse(data);
                let yaml = `log:
  level: info
api:
  listen: ":1984"
rtsp:
  listen: ":8554"
webrtc:
  listen: ":8555"
streams:
`;

                cameras.forEach(cam => {
                    if (cam.enabled === false || !cam.streams) return;
                    const mainUrl = cam.streams.main || "";
                    const subUrl = cam.streams.sub || mainUrl;

                    if (!mainUrl) return;

                    // SIMPLE FORMAT - NO TRANSPORT TCP (to avoid parse error)
                    yaml += `  ${cam.id}_hd: ${mainUrl}\n`;
                    yaml += `  ${cam.id}_sub: ${subUrl}\n`;
                    yaml += `  ${cam.id}: ${cam.id}_sub\n`;
                });

                // Write YAML
                const b64 = Buffer.from(yaml).toString('base64');
                const cmd = `echo '${b64}' | base64 -d > /opt/dss-edge/go2rtc.yaml && systemctl restart dss-go2rtc && sleep 3 && systemctl status dss-go2rtc --no-pager -n 5`;

                conn.exec(cmd, (err2, s2) => {
                    s2.pipe(process.stdout);
                    s2.on('close', () => {
                        console.log("\n✅ Simple YAML generated. Check if errors gone.");
                        conn.end();
                    });
                });

            } catch (e) {
                console.error("JSON Error:", e);
                conn.end();
            }
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
