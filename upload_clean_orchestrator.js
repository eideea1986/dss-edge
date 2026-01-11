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

console.log("=== UPLOAD CLEAN ORCHESTRATOR (NO AUTO-GEN) ===");

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        console.log(`📤 Uploading clean version...`);
        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) {
                console.error("Upload Failed:", err);
                conn.end();
                return;
            }
            console.log("✅ Clean orchestrator uploaded.");

            // Regenerate YAML manually + restart
            console.log("🔄 Regenerating YAML and restarting...");
            conn.exec('node /root/yaml_no_alias.js', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => {
                    console.log("\n✅ Done. Refresh browser now!");
                    conn.end();
                });
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
