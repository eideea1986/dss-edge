const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== Quick Fix 146 SubStream ===");

conn.on('ready', () => {
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                let cams = JSON.parse(data);
                // Find 146
                let target = cams.find(c => c.ip.includes("120.146"));
                if (target) {
                    // Update STREAM
                    if (target.streams && target.streams.sub) {
                        target.streams.sub = target.streams.sub.replace("subtype=0", "subtype=1");
                        console.log(`Updated 146 sub-stream to: ${target.streams.sub}`);
                    }

                    // Save
                    const newJson = JSON.stringify(cams, null, 4);
                    const b64 = Buffer.from(newJson).toString('base64');
                    const cmd = `echo '${b64}' | base64 -d > /opt/dss-edge/config/cameras.json && rm /opt/dss-edge/go2rtc.yaml && systemctl restart dss-edge`;

                    conn.exec(cmd, (err2, s2) => {
                        s2.on('close', () => {
                            console.log("✅ Fix applied & Restarting...");
                            conn.end();
                        });
                    });
                } else {
                    console.log("⚠️ Camera 146 not found in DB.");
                    conn.end();
                }
            } catch (e) { console.error(e); conn.end(); }
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
