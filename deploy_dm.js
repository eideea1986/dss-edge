const { Client } = require('ssh2');
const path = require('path');

const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();

conn.on('ready', () => {
    const localPath = path.join(__dirname, 'camera-manager/decoderManager.js');
    const remotePath = '/opt/dss-edge/camera-manager/decoderManager.js';

    conn.sftp((err, sftp) => {
        if (err) throw err;
        console.log(`Uploading ${localPath} -> ${remotePath}`);
        sftp.fastPut(localPath, remotePath, (err2) => {
            if (err2) console.error("Upload failed:", err2);
            else console.log("Upload successful.");
            conn.end();
        });
    });
}).connect(config);
