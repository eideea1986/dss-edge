const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECKING CONFIG FOR 146 ===");

conn.on('ready', () => {
    // Grep with context to catch streams
    conn.exec('grep -C 5 "120.146" /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let found = false;
        stream.on('data', d => {
            process.stdout.write(d);
            found = true;
        });
        stream.on('close', () => {
            // also read full json for precision if grep fails context
            if (!found) {
                console.log("Not found by grep, trying full read...");
                conn.exec('cat /opt/dss-edge/config/cameras.json', (e, s) => {
                    let d = ""; s.on('data', c => d += c); s.on('close', () => {
                        try {
                            const j = JSON.parse(d);
                            const c = j.find(x => x.ip && x.ip.includes("146"));
                            console.log(JSON.stringify(c, null, 2));
                        } catch (ex) { }
                        conn.end();
                    });
                });
            } else {
                conn.end();
            }
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
