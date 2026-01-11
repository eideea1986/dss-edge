const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== UNIVERSAL SUBSTREAM FIXER ===");

conn.on('ready', () => {
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                let cams = JSON.parse(data);
                let changes = 0;

                cams = cams.map(c => {
                    if (!c.streams || !c.streams.sub) return c;

                    let sub = c.streams.sub;
                    let main = c.streams.main || sub;

                    // Logic 1: Hikvision (101 -> 102)
                    if (sub.includes("/Streaming/Channels/101")) {
                        c.streams.sub = sub.replace("/101", "/102");
                        changes++;
                    }
                    else if (sub.includes("/stream1")) { // Hikvision Variant
                        c.streams.sub = sub.replace("/stream1", "/stream2");
                        changes++;
                    }

                    // Logic 2: Dahua (subtype=0 -> subtype=1)
                    if (sub.includes("subtype=0")) {
                        c.streams.sub = sub.replace("subtype=0", "subtype=1");
                        changes++;
                    }
                    // Dahua alternate (live/main -> live/sub)
                    if (sub.includes("/live/main")) {
                        c.streams.sub = sub.replace("/main", "/sub");
                        changes++;
                    }

                    return c;
                });

                console.log(`Updated SubStreams for ${changes} cameras.`);

                if (changes > 0) {
                    const newJson = JSON.stringify(cams, null, 4);
                    // Use base64 trick for safe write
                    const b64 = Buffer.from(newJson).toString('base64');
                    const cmd = `echo '${b64}' | base64 -d > /opt/dss-edge/config/cameras.json && rm -f /opt/dss-edge/go2rtc.yaml && systemctl restart dss-edge`;

                    conn.exec(cmd, (err2, s2) => {
                        s2.on('close', () => {
                            console.log("✅ Config Saved & Restarting...");
                            conn.end();
                        });
                    });
                } else {
                    console.log("No changes needed.");
                    conn.end();
                }

            } catch (e) { console.error(e); conn.end(); }
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
