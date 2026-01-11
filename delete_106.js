const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CLEANUP: Removing Camera 106 ===");

conn.on('ready', () => {
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                let cams = JSON.parse(data);
                const initialLen = cams.length;
                // Filter out 106
                cams = cams.filter(c => !c.ip.includes("120.106"));

                if (cams.length < initialLen) {
                    const newJson = JSON.stringify(cams, null, 4);
                    const cmd = `echo '${newJson}' > /opt/dss-edge/config/cameras.json && systemctl restart dss-edge`;

                    conn.exec(cmd, (err, s) => {
                        if (err) throw err;
                        s.on('close', () => {
                            console.log("✅ Camera 106 removed. Service restarting...");
                            conn.end();
                        });
                    });
                } else {
                    console.log("⚠️ Camera 106 not found.");
                    conn.end();
                }
            } catch (e) {
                console.error("JSON Error:", e);
                conn.end();
            }
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
