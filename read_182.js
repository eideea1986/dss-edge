const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== FULL CONFIG FOR 182 ===");

conn.on('ready', () => {
    // Read file and parse JSON locally to find the exact entry
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                const cams = JSON.parse(data);
                const c = cams.find(x => x.ip && x.ip.includes("120.182"));
                if (c) {
                    console.log(JSON.stringify(c, null, 4));
                } else {
                    console.log("Camera 182 not found.");
                }
                conn.end();
            } catch (e) {
                console.error(e);
                conn.end();
            }
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
