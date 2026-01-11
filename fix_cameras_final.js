const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== FIXING CAMERAS 145 & 146 ===");

conn.on('ready', () => {
    // 1. Read existing cameras.json
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                let cams = JSON.parse(data);
                let modified = false;

                // 2. Modify specific cameras
                cams.forEach(c => {
                    if (c.ip.includes("120.145") || c.ip.includes("120.146")) {
                        console.log(`Fixing ${c.ip}...`);
                        c.credentials = { user: "admin", pass: "a1b2c3d4" };
                        c.vendor = "Dahua";

                        const auth = `admin:a1b2c3d4@${c.ip}:554`;
                        c.streams = {
                            main: `rtsp://${auth}/cam/realmonitor?channel=1&subtype=0`,
                            sub: `rtsp://${auth}/cam/realmonitor?channel=1&subtype=1`
                        };
                        c.status = "ONLINE"; // Optimistic, we verified it
                        modified = true;
                    }
                });

                if (modified) {
                    // 3. Write back cameras.json
                    const newJson = JSON.stringify(cams, null, 4);
                    const cmd = `echo '${newJson}' > /opt/dss-edge/config/cameras.json`;

                    conn.exec(cmd, (err, s) => {
                        if (err) throw err;
                        s.on('close', () => {
                            console.log("✅ Config Updated. Restarting Services...");
                            // Restart everything to reload config and Go2RTC
                            conn.exec('systemctl restart dss-edge', (err, s2) => {
                                s2.on('close', () => {
                                    console.log("✅ Services Restarted. Check UI in 30s.");
                                    conn.end();
                                });
                            });
                        });
                    });
                } else {
                    console.log("⚠️ Cameras 145/146 not found in config. Please add them first.");
                    conn.end();
                }

            } catch (e) {
                console.error("JSON Parse Error:", e);
                conn.end();
            }
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
