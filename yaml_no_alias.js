const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== GENERATE YAML WITHOUT ALIASES ===");

conn.on('ready', () => {
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

                    // NO ALIASES - Only direct streams
                    yaml += `  ${cam.id}_hd: ${mainUrl}\n`;
                    yaml += `  ${cam.id}_sub: ${subUrl}\n`;
                    // NO DEFAULT ALIAS
                });

                const b64 = Buffer.from(yaml).toString('base64');
                const cmd = `echo '${b64}' | base64 -d > /opt/dss-edge/go2rtc.yaml && systemctl restart dss-go2rtc && sleep 3 && systemctl status dss-go2rtc --no-pager -n 5`;

                conn.exec(cmd, (err2, s2) => {
                    s2.pipe(process.stdout);
                    s2.on('close', () => {
                        console.log("\n✅ YAML regenerated WITHOUT aliases.");
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
