const { Client } = require('ssh2');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
const localFile = path.resolve('camera-manager/go2rtcUtils.js');
const remoteFile = '/opt/dss-edge/camera-manager/go2rtcUtils.js';

console.log("=== UPDATE GO2RTC UTILS & REGENERATE ===");

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        console.log(`📤 Uploading: ${localFile} -> ${remoteFile}`);
        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) {
                console.error("Upload Failed:", err);
                conn.end();
                return;
            }
            console.log("✅ File updated.");

            console.log("🔄 Restarting dss-edge to trigger config generation...");
            conn.exec('systemctl restart dss-edge', (err, stream) => {
                stream.on('close', () => {
                    console.log("✅ Service restarted. Config should be generated now.");
                    conn.end();
                });
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
