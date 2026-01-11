const { Client } = require('ssh2');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
const localFile = path.resolve('local-api/routes/cameras.js');
const remoteFile = '/opt/dss-edge/local-api/routes/cameras.js';

console.log("=== UPDATE: API Route DELETE (Cleanup Logic) ===");

conn.on('ready', () => {
    console.log('✅ SSH Connected');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        console.log(`📤 Uploading: ${localFile} -> ${remoteFile}`);
        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) {
                console.error("❌ Upload Failed:", err);
                conn.end();
                return;
            }
            console.log("✅ File updated successfully.");

            console.log("🔄 Restarting dss-edge service...");
            conn.exec('systemctl restart dss-edge', (err, stream) => {
                if (err) throw err;
                stream.on('close', (code) => {
                    console.log(`✅ Service Restarted (Exit Code: ${code})`);
                    conn.end();
                });
            });
        });
    });
}).on('error', (err) => {
    console.error("❌ Connection Error:", err.message);
}).connect(config);
