const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();
const localBuildDir = path.join(__dirname, 'local-ui/build');
const remoteBuildDir = '/opt/dss-edge/local-ui/build';

async function uploadDir(sftp, localDir, remoteDir) {
    // Ensure remote dir exists
    try { await new Promise((resolve, reject) => sftp.mkdir(remoteDir, err => { if (err && err.code !== 4) reject(err); else resolve(); })); } catch (e) { }

    const files = fs.readdirSync(localDir);
    for (const file of files) {
        const localPath = path.join(localDir, file);
        const remotePath = `${remoteDir}/${file}`;
        const stats = fs.statSync(localPath);

        if (stats.isDirectory()) {
            await uploadDir(sftp, localPath, remotePath);
        } else {
            console.log(`Uploading ${file}...`);
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
    console.log('SSH Connected. Cleaning remote dir...');
    conn.exec(`if [ -d "${remoteBuildDir}" ]; then rm -rf ${remoteBuildDir}/*; else mkdir -p ${remoteBuildDir}; fi`, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Remote cleanup done. Starting upload...');
            conn.sftp(async (err, sftp) => {
                if (err) throw err;
                try {
                    await uploadDir(sftp, localBuildDir, remoteBuildDir);
                    console.log('✅ UI DEPLOY SUCCESSFUL (Password Auth)');
                } catch (e) {
                    console.error('Upload Error:', e);
                } finally {
                    conn.end();
                }
            });
        }).resume();
    });
}).connect(config);
