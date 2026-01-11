const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const ips = ["192.168.120.145", "192.168.120.146"];

const conn = new Client();
console.log("=== NETWORK CHECK (PING + PORT 554) ===");

conn.on('ready', () => {
    let cmd = "";
    ips.forEach(ip => {
        cmd += `echo "--- Checking ${ip} ---"; `;
        cmd += `ping -c 2 -W 1 ${ip} > /dev/null && echo "✅ PING OK" || echo "❌ PING FAIL"; `;
        // Simple bash TCP check on port 554
        cmd += `(echo > /dev/tcp/${ip}/554) >/dev/null 2>&1 && echo "✅ RTSP Port 554 OPEN" || echo "❌ RTSP Port 554 CLOSED"; `;
    });

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => conn.end());
    });

}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
