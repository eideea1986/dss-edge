const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_PATH = 'i:/dispecerat/github_release/dss-edge/local-api/services/aiRequest.js';
const REMOTE_PATH = '/opt/dss-edge/local-api/services/aiRequest.js';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(LOCAL_PATH, REMOTE_PATH, (err) => {
            if (err) {
                console.error("Upload failed:", err);
            } else {
                console.log("aiRequest.js PATCH uploaded successfully!");
                // Restart ALL to ensure Orchestrator gets it
                conn.exec('pm2 restart all', (err, stream) => {
                    if (err) throw err;
                    stream.on('clone', () => {
                        console.log('PM2 restart all issued.');
                    });
                    stream.on('data', (d) => process.stdout.write(d));
                    stream.on('close', () => {
                        console.log("PM2 Restart Complete.");
                        conn.end();
                    });
                });
            }
        });
    });
}).connect(config);
