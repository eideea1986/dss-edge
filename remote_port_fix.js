const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== REMOTE PATCH: Change WS Port to 8090 ===");

conn.on('ready', () => {
    // 1. Change Port 8081 -> 8090 in server.js to avoid EADDRINUSE conflict
    // 2. Restart Service
    const cmd = "sed -i 's/port: 8081/port: 8090/g' /opt/dss-edge/local-api/server.js && systemctl restart dss-edge";

    console.log(`🚀 Executing: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
            console.log(`Patch Applied. Checking status in 5s...`);
            setTimeout(() => {
                conn.exec('systemctl status dss-edge --no-pager', (err, s) => {
                    s.pipe(process.stdout);
                    s.on('close', () => conn.end());
                });
            }, 5000);
        });
    });
}).on('error', (err) => {
    console.error("Connection Error:", err);
}).connect(config);
