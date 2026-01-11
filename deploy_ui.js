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

async function uploadDir(sftp, lDir, rDir) {
    try {
        // Ensure remote dir exists
        await new Promise((res, rej) => sftp.mkdir(rDir, e => res()));
    } catch { }

    const files = fs.readdirSync(lDir);
    for (const f of files) {
        const lPath = path.join(lDir, f);
        const rPath = `${rDir}/${f}`;
        const stat = fs.statSync(lPath);

        if (stat.isDirectory()) {
            await uploadDir(sftp, lPath, rPath);
        } else {
            console.log(`Uploading ${f}...`);
            await new Promise((res, rej) => sftp.fastPut(lPath, rPath, e => e ? rej(e) : res()));
        }
    }
}

conn.on('ready', () => {
    console.log('SSH Connected. Uploading UI Build...');
    conn.sftp(async (err, sftp) => {
        if (err) throw err;
        try {
            // First time setup might need recursive mkdir, but we assume base exists
            await uploadDir(sftp, localBuildDir, remoteBuildDir);
            console.log('✅ UI DEPLOY SUCCESSFUL');
        } catch (e) {
            console.error(e);
        } finally {
            conn.end();
            process.exit(0);
        }
    });
}).connect(config);
