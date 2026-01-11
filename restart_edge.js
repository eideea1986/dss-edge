const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== RESTART DSS-EDGE (Will Regenerate Go2RTC Config) ===");

conn.on('ready', () => {
    conn.exec('systemctl restart dss-edge && sleep 5 && systemctl status dss-edge --no-pager -n 10', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n✅ Service restarted. Config should be regenerated.");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
