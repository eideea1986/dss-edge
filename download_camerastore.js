const { Client } = require('ssh2');
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== DOWNLOAD CAMERASTORE ===");

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        sftp.readFile('/opt/dss-edge/local-api/store/cameraStore.js', 'utf8', (err, data) => {
            if (err) throw err;
            fs.writeFileSync('local-api/store/cameraStore.js', data);
            console.log("✅ Downloaded cameraStore.js");
            conn.end();
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
