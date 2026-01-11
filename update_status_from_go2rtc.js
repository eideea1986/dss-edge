const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== UPDATE CAMERA STATUS FROM GO2RTC ===");

conn.on('ready', () => {
    // Get active streams from Go2RTC
    conn.exec('curl -s http://127.0.0.1:1984/api/streams', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                const streams = JSON.parse(data);
                const activeStreamIds = Object.keys(streams);

                console.log(`Active streams in Go2RTC: ${activeStreamIds.length}`);

                // Now read cameras.json and update status
                conn.exec('cat /opt/dss-edge/config/cameras.json', (err2, s2) => {
                    let camData = "";
                    s2.on('data', d => camData += d);
                    s2.on('close', () => {
                        try {
                            let cameras = JSON.parse(camData);
                            let updated = 0;

                            cameras = cameras.map(cam => {
                                // Check if cam_xxx_hd or cam_xxx_sub exists in Go2RTC
                                const hasStream = activeStreamIds.some(id => id.startsWith(cam.id));
                                const newStatus = hasStream ? "ONLINE" : "OFFLINE";

                                if (cam.status !== newStatus) {
                                    console.log(`${cam.ip}: ${cam.status} -> ${newStatus}`);
                                    updated++;
                                }

                                return { ...cam, status: newStatus };
                            });

                            console.log(`\nUpdated ${updated} cameras.`);

                            // Save
                            const newJson = JSON.stringify(cameras, null, 4);
                            const b64 = Buffer.from(newJson).toString('base64');
                            const cmd = `echo '${b64}' | base64 -d > /opt/dss-edge/config/cameras.json`;

                            conn.exec(cmd, (err3, s3) => {
                                s3.on('close', () => {
                                    console.log("✅ Status updated in cameras.json");
                                    conn.end();
                                });
                            });

                        } catch (e) {
                            console.error("Cameras JSON Error:", e);
                            conn.end();
                        }
                    });
                });

            } catch (e) {
                console.error("Streams JSON Error:", e);
                conn.end();
            }
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
