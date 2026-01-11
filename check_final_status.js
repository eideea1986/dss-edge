const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== FINAL STATUS CHECK ===");

conn.on('ready', () => {
    // Check service status & logs from last minute
    conn.exec('systemctl status dss-edge --no-pager && journalctl -u dss-edge -n 20 --no-pager', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => conn.end());
    });
}).on('error', (err) => {
    console.error("Connection Error:", err);
}).connect(config);
