const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== FLUSH & MIGRATE TO TCP ===");

conn.on('ready', () => {
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                let cams = JSON.parse(data);

                // FORCE TCP ON ALL STREAMS
                cams = cams.map(c => {
                    if (c.streams) {
                        ['main', 'sub'].forEach(k => {
                            if (c.streams[k] && !c.streams[k].includes("transport=tcp")) {
                                const sep = c.streams[k].includes("?") ? "&" : "?";
                                c.streams[k] += `${sep}transport=tcp`;
                            }
                        });
                    }
                    return c;
                });

                const newJson = JSON.stringify(cams, null, 4);
                const b64 = Buffer.from(newJson).toString('base64');

                // Stop services, Wait, Write, Start
                const cmd = `
                    systemctl stop dss-edge dss-go2rtc
                    sleep 5
                    echo '${b64}' | base64 -d > /opt/dss-edge/config/cameras.json
                    rm -f /opt/dss-edge/go2rtc.yaml
                    systemctl start dss-edge
                `;

                conn.exec(cmd, (err2, s2) => {
                    s2.on('close', () => {
                        console.log("✅ Converted to TCP & Restarted Full Stack.");
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
