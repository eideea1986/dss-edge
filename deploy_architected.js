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
    console.log('SSH Ready - Deploying Architected Pipeline');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(LOCAL_PATH, REMOTE_PATH, (err) => {
            if (err) throw err;
            console.log("Uploaded Clean Code.");
            // Restart API safely
            conn.exec('pm2 restart dss-edge-api', (err, stream) => {
                stream.on('close', () => conn.end());
            });
        });
    });
}).connect(config);
