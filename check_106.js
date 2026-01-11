const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECKING CONFIG FOR 106 ===");

conn.on('ready', () => {
    conn.exec('grep -C 5 "120.106" /opt/dss-edge/config/cameras.json', (err, stream) => {
        if (err) throw err;
        let found = false;
        stream.on('data', d => {
            process.stdout.write(d);
            found = true;
        });
        stream.on('close', () => {
            if (!found) console.log("Camera 106 not found.");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
