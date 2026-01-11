const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== REVERTING TO SIMPLE RTSP YAML ===");

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
                    let hd = cam.rtspHd || cam.rtspMain || cam.rtsp || (cam.streams && cam.streams.main);
                    let sub = cam.rtspSub || cam.rtsp || (cam.streams && cam.streams.sub);

                    if (!hd && cam.rtsp) hd = cam.rtsp;
                    if (!sub && hd) sub = hd;

                    if (hd) {
                        yaml += `  ${cam.id}_hd: ${hd.split('#')[0].trim()}\n`;
                    }
                    if (sub) {
                        yaml += `  ${cam.id}_sub: ${sub.split('#')[0].trim()}\n`;
                    }
                    if (sub) {
                        yaml += `  ${cam.id}: ${sub.split('#')[0].trim()}\n`;
                    } else if (hd) {
                        yaml += `  ${cam.id}: ${hd.split('#')[0].trim()}\n`;
                    }
                });

                const b64 = Buffer.from(yaml).toString('base64');
                const cmd = `echo '${b64}' | base64 -d > /opt/dss-edge/go2rtc.yaml && systemctl restart dss-go2rtc`;

                conn.exec(cmd, (err2, s2) => {
                    s2.on('close', () => {
                        console.log("\n✅ Simple YAML Restored.");
                        conn.end();
                    });
                });

            } catch (e) { console.error(e); conn.end(); }
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
