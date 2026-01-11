const { Client } = require('ssh2');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
const localFile = path.resolve('orchestrator/edgeOrchestrator.js');
const remoteFile = '/opt/dss-edge/orchestrator/edgeOrchestrator.js';

console.log("=== UPDATE ORCHESTRATOR & RESTART ===");

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

            console.log("🔄 Restarting dss-edge...");
            conn.exec('systemctl restart dss-edge && sleep 5 && wc -l /opt/dss-edge/go2rtc.yaml && head -20 /opt/dss-edge/go2rtc.yaml', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => {
                    console.log("\n✅ Restarted. Check output above for go2rtc.yaml content.");
                    conn.end();
                });
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
