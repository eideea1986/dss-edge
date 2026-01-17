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
    console.log('SSH Ready - Deploying NVR Orchestrator');

    // Upload first
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(LOCAL_PATH, REMOTE_PATH, (err) => {
            if (err) throw err;
            console.log("Uploaded.");

            // Execute Cleanup & Restart
            const cmds = [
                'pm2 stop dss-edge-orch',
                'killall -9 ffmpeg', // Kill all recording/snapshot processes
                'sleep 2',
                'pm2 restart dss-edge-orch'
            ];

            conn.exec(cmds.join('; '), (err, stream) => {
                stream.on('close', () => {
                    console.log("NVR Orchestrator Restarted.");
                    conn.end();
                });
            });
        });
    });
}).connect(config);
