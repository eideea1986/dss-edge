const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK DELETE ERROR LOGS ===");

conn.on('ready', () => {
    // Look for logs from our 'routes/cameras.js'
    const cmd = 'journalctl -u dss-edge -n 50 --no-pager | grep -i "DELETE"';

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => conn.end());
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
