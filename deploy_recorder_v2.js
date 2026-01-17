const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    conn.sftp(async (err, sftp) => {
        if (err) throw err;
        try {
            console.log("1. Creating Record V2 Directory...");
            // Ensure dir exists (likely does, but safe check)
            await new Promise(r => conn.exec('mkdir -p /opt/dss-edge/modules/record', r));

            console.log("2. Uploading Recorder V2 & Indexer...");
            const filesToUpload = [
                ['recorder_deploy/modules/record/recorder_v2.js', '/opt/dss-edge/modules/record/recorder_v2.js'],
                ['recorder_deploy/modules/record/storage_indexer.js', '/opt/dss-edge/modules/record/storage_indexer.js']
            ];

            for (const [local, remote] of filesToUpload) {
                await new Promise((resolve, reject) => {
                    sftp.fastPut(path.join(__dirname, local), remote, (err) => {
                        if (err) reject(err); else resolve();
                    });
                });
            }

            console.log("3. Updating Registry...");
            const localReg = path.join(__dirname, 'recorder_deploy/core/orchestrator/serviceRegistry.js');
            const remoteReg = '/opt/dss-edge/core/orchestrator/serviceRegistry.js';
            await new Promise((resolve, reject) => {
                sftp.fastPut(localReg, remoteReg, (err) => {
                    if (err) reject(err); else resolve();
                });
            });

            console.log("✅ RECORDER V2 DEPLOYED.");
            conn.end();

        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
