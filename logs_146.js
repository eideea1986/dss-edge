const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== APP LOGS for 146 ===");

conn.on('ready', () => {
    conn.exec('journalctl -u dss-edge -n 100 --no-pager | grep cam_6f037858', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => conn.end());
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
