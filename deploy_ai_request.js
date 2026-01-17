const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const REMOTE_PATH = '/opt/dss-edge/local-api/services/aiRequest.js';
const LOCAL_PATH = 'i:/dispecerat/github_release/dss-edge/local-api/services/aiRequest.js';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(LOCAL_PATH, REMOTE_PATH, (err) => {
            if (err) {
                console.error("Upload failed:", err);
            } else {
                console.log("aiRequest.js updated successfully!");
                // Restart service via PM2
                conn.exec('pm2 restart dss-edge-api', (err, stream) => {
                    if (err) throw err;
                    stream.on('close', () => {
                        console.log('API Restarted.');
                        conn.end();
                    });
                    stream.on('data', (d) => process.stdout.write(d));
                });
            }
        });
    });
}).connect(config);
