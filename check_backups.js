const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK FOR BACKUPS ON SERVER ===");

conn.on('ready', () => {
    conn.exec('ls -lh /opt/dss-edge/*.bk /opt/dss-edge/camera-manager/*.bk /opt/dss-edge/orchestrator/*.bk 2>/dev/null || echo "No backups found"', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n=== Checking if go2rtc.yaml exists and works ===");
            conn.exec('test -f /opt/dss-edge/go2rtc.yaml && echo "EXISTS" || echo "MISSING"', (err2, s2) => {
                s2.pipe(process.stdout);
                s2.on('close', () => conn.end());
            });
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
