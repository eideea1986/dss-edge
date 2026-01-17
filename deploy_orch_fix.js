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
    console.log('SSH Ready - Deploying Full Orchestrator');

    // 1. Kill Port 8080 first
    conn.exec("fuser -k 8080/tcp || true", (err, stream) => {
        stream.on('close', () => {
            console.log("Port 8080 cleared.");

            // 2. Upload File
            conn.sftp((err, sftp) => {
                if (err) throw err;
                sftp.fastPut(LOCAL_PATH, REMOTE_PATH, (err) => {
                    if (err) {
                        console.error("Upload failed:", err);
                    } else {
                        console.log("Orchestrator Uploaded.");

                        // 3. Restart Service
                        conn.exec('pm2 restart dss-edge-orch', (err, stream2) => {
                            if (err) throw err;
                            stream2.on('close', () => {
                                console.log("Orchestrator Restarted.");
                                conn.end();
                            });
                        });
                    }
                });
            });
        });
    });
}).connect(config);
