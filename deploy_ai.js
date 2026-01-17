const Client = require('ssh2').Client;
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.209',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const localFile = path.resolve(__dirname, 'ai_server.py');
const remoteFile = '/opt/dss-ai-server/ai_server.py';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Connected to AI Server (209). Uploading ai_server.py...');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) {
                console.error("Upload failed:", err);
            } else {
                console.log("Upload successful.");
                // Kill existing python process and restart
                conn.exec('killall python3; cd /opt/dss-ai-server; nohup python3 ai_server.py > nohup.out 2>&1 &', (err, stream) => {
                    if (err) throw err;
                    stream.on('close', () => {
                        console.log("Restart command sent.");
                        conn.end();
                    });
                });
            }
        });
    });
}).connect(config);
