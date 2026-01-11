const { Client } = require('ssh2');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
const localFile = path.resolve('local-api/store/cameraStore.js');
const remoteFile = '/opt/dss-edge/local-api/store/cameraStore.js';

console.log("=== UPLOAD FIXED CAMERASTORE ===");

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        console.log(`📤 Uploading fixed cameraStore...`);
        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) {
                console.error("Upload Failed:", err);
                conn.end();
                return;
            }
            console.log("✅ File updated.");

            console.log("🔄 Restarting dss-edge...");
            conn.exec('systemctl restart dss-edge && sleep 5 && echo "Done. Refresh browser now!"', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => {
                    console.log("\n✅ Service restarted. Cameras should now show ONLINE!");
                    conn.end();
                });
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
