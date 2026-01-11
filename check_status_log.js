const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK STATUS LOG ===");

conn.on('ready', () => {
    conn.exec('tail -n 20 /opt/dss-edge/status_update.log', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => conn.end());
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
