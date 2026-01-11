const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== GO2RTC ERROR CHECK ===");

conn.on('ready', () => {
    conn.exec('journalctl -u dss-go2rtc -n 20 --no-pager | grep -E "(WRN|ERR|error)"', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n=== CHECKING GENERATED YAML ===");
            conn.exec('head -40 /opt/dss-edge/go2rtc.yaml', (err2, s2) => {
                s2.pipe(process.stdout);
                s2.on('close', () => conn.end());
            });
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
