const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== RESTARTING SERVICE ===");

conn.on('ready', () => {
    conn.exec('systemctl restart dss-edge', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
            console.log(`✅ Service Restarted. Code: ${code}`);
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
