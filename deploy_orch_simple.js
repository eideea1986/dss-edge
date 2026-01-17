const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_PATH = 'i:/dispecerat/github_release/dss-edge/orchestrator/edgeOrchestrator.js';
const REMOTE_PATH = '/opt/dss-edge/orchestrator/edgeOrchestrator.js';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Simple Upload');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(LOCAL_PATH, REMOTE_PATH, (err) => {
            if (err) console.error(err);
            else {
                console.log("Uploaded.");
                // Force Kill Node and restart Orch
                conn.exec('pkill -9 -f node; pm2 restart dss-edge-orch', (err, stream) => {
                    stream.on('close', () => conn.end());
                });
            }
        });
    });
}).connect(config);
