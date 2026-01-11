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
const localDir = path.join(__dirname, 'local-api');
const remoteDir = '/opt/dss-edge/local-api';

async function uploadDir(sftp, lDir, rDir) {
    try { await new Promise((res, rej) => sftp.mkdir(rDir, e => res())); } catch { }
    const files = fs.readdirSync(lDir);
    for (const f of files) {
        const lPath = path.join(lDir, f);
        const rPath = `${rDir}/${f}`;
        if (fs.statSync(lPath).isDirectory()) {
            if (f !== 'node_modules' && f !== '.git') await uploadDir(sftp, lPath, rPath);
        } else {
            console.log(`Uploading ${f}...`);
            await new Promise((res, rej) => sftp.fastPut(lPath, rPath, e => e ? rej(e) : res()));
        }
    }
}

conn.on('ready', () => {
    console.log('SSH Connected. Uploading API...');
    conn.sftp(async (err, sftp) => {
        if (err) throw err;
        try {
            await uploadDir(sftp, localDir, remoteDir);
            console.log('✅ API DEPLOY SUCCESSFUL');
        } catch (e) {
            console.error(e);
        } finally {
            conn.end();
        }
    });
}).connect(config);
