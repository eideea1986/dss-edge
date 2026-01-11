const { Client } = require('ssh2');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const filesToUpload = [
    { local: 'camera-manager/go2rtcUtils.js', remote: '/opt/dss-edge/camera-manager/go2rtcUtils.js' },
    { local: 'orchestrator/edgeOrchestrator.js', remote: '/opt/dss-edge/orchestrator/edgeOrchestrator.js' }
];

const conn = new Client();
console.log("=== ROLLBACK TO GITHUB VERSION ===");

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        let uploaded = 0;
        filesToUpload.forEach(file => {
            const localPath = path.resolve(file.local);
            console.log(`📤 Uploading: ${file.local}`);
            sftp.fastPut(localPath, file.remote, (err) => {
                if (err) {
                    console.error(`❌ Failed: ${file.local}`, err);
                } else {
                    console.log(`✅ ${file.local}`);
                }
                uploaded++;
                if (uploaded === filesToUpload.length) {
                    console.log("\n🔄 Restarting dss-edge...");
                    conn.exec('systemctl restart dss-edge', (err, stream) => {
                        stream.on('close', () => {
                            console.log("✅ Service restarted with CLEAN GitHub version.");
                            conn.end();
                        });
                    });
                }
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
