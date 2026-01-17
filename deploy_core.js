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

async function uploadDir(sftp, localDir, remoteDir) {
    // Ensure remote dir exists
    try { await sftp.mkdir(remoteDir); } catch (e) { }

    const files = fs.readdirSync(localDir);
    for (const file of files) {
        const localPath = path.join(localDir, file);
        const remotePath = `${remoteDir}/${file}`;
        const stats = fs.statSync(localPath);

        if (stats.isDirectory()) {
            await uploadDir(sftp, localPath, remotePath);
        } else {
            console.log(`Uploading ${file} to ${remotePath}...`);
            await new Promise((resolve, reject) => {
                sftp.fastPut(localPath, remotePath, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }
}

conn.on('ready', () => {
    console.log('SSH Connected.');
    conn.sftp(async (err, sftp) => {
        if (err) throw err;
        try {
            console.log("1. Creating Directory Structure...");
            // Create base dirs
            await new Promise(r => conn.exec('mkdir -p /opt/dss-edge/core/orchestrator /opt/dss-edge/modules /opt/dss-edge/bus', r));

            console.log("2. Uploading Orchestrator Core...");
            await uploadDir(sftp, path.join(__dirname, 'recorder_deploy/core/orchestrator'), '/opt/dss-edge/core/orchestrator');

            console.log("3. Installing Dependencies...");
            // We need ioredis
            conn.exec('cd /opt/dss-edge && npm install ioredis', (err, stream) => {
                stream.on('close', () => {
                    console.log("✅ CORE DEPLOYED.");
                    conn.end();
                });
            });

        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
