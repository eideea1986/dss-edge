const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CRITICAL STATUS CHECK ===");

conn.on('ready', () => {
    const cmd = `
        echo "=== SERVICES ==="
        systemctl is-active dss-edge dss-go2rtc
        echo ""
        echo "=== GO2RTC LOGS (Last 10 lines) ==="
        journalctl -u dss-go2rtc -n 10 --no-pager
        echo ""
        echo "=== BROWSER TEST URL ==="
        curl -s http://127.0.0.1:1984/api/streams | head -50
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => conn.end());
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
