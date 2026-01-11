const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== EMERGENCY FIX: Delete Broken Config & Restart ===");

conn.on('ready', () => {
    const cmd = `
        systemctl stop dss-edge dss-go2rtc
        rm -f /opt/dss-edge/go2rtc.yaml
        sleep 2
        systemctl start dss-go2rtc
        sleep 3
        systemctl start dss-edge
        sleep 5
        systemctl status dss-go2rtc dss-edge --no-pager -n 5
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n✅ Services restarted. Go2RTC should use default/internal config now.");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
