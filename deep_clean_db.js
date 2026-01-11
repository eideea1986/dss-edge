const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== DEEP CLEAN: Deduplicate & Fix Streams ===");

conn.on('ready', () => {
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                let cams = JSON.parse(data);
                const initialCount = cams.length;

                // 1. DEDUPLICATE BY IP (Keep latest)
                const uniqueCams = {};
                cams.forEach(c => {
                    if (c.ip) {
                        uniqueCams[c.ip] = c; // Overwrites previous, keeping last
                    }
                });
                let cleanList = Object.values(uniqueCams);
                console.log(`Deduplication: ${initialCount} -> ${cleanList.length} cameras.`);

                // 2. FIX DAHUA SUBSTREAMS
                cleanList = cleanList.map(c => {
                    if (c.streams && c.streams.sub && c.streams.sub.includes("subtype=0")) {
                        // Check if it looks like Dahua
                        if (c.streams.sub.includes("cam/realmonitor")) {
                            console.log(`Fixing SubStream for ${c.ip} ...`);
                            c.streams.sub = c.streams.sub.replace("subtype=0", "subtype=1");
                        }
                    }
                    // Ensure ID is valid
                    if (!c.id) c.id = "cam_" + require('crypto').randomBytes(4).toString('hex');
                    return c;
                });

                // 3. SAVE & RESTART
                const newJson = JSON.stringify(cleanList, null, 4);
                // Escape simple quotes for echo
                // Using base64 to avoid quoting hell
                const b64 = Buffer.from(newJson).toString('base64');

                const cmd = `echo '${b64}' | base64 -d > /opt/dss-edge/config/cameras.json && rm /opt/dss-edge/go2rtc.yaml && systemctl restart dss-edge`;

                conn.exec(cmd, (err2, s2) => {
                    if (err2) throw err2;
                    s2.on('close', () => {
                        console.log("✅ Database Cleaned & Service Restarted.");
                        conn.end();
                    });
                });

            } catch (e) {
                console.error("JSON Process Error:", e);
                conn.end();
            }
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
