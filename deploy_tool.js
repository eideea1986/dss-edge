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

console.log("=== REMOTE DEPLOYMENT STARTED ===");

conn.on('ready', () => {
    console.log('✅ SSH Connection Established');

    // 1. Upload Patch
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const localFile = path.resolve('dss-edge-patch.tar.gz');
        const remoteFile = '/root/dss-edge-patch.tar.gz';
        const scriptLocal = path.resolve('deploy_patch.sh');
        const scriptRemote = '/root/deploy_patch.sh';

        console.log(`📤 Uploading Patch: ${localFile} -> ${remoteFile}`);

        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) {
                console.error("❌ Upload Failed:", err);
                conn.end();
                return;
            }
            console.log("✅ Patch Uploaded.");

            console.log(`📤 Uploading Script: ${scriptLocal} -> ${scriptRemote}`);
            sftp.fastPut(scriptLocal, scriptRemote, (err) => {
                if (err) {
                    console.error("❌ Script Upload Failed:", err);
                    conn.end();
                    return;
                }
                console.log("✅ Script Uploaded.");

                // 2. Execute Deployment
                const cmd = `chmod +x ${scriptRemote} && ${scriptRemote}`;
                console.log(`🚀 Executing: ${cmd}`);

                conn.exec(cmd, (err, stream) => {
                    if (err) throw err;
                    stream.on('close', (code, signal) => {
                        console.log('Deployment Script exit code: ' + code);
                        conn.end();
                    }).on('data', (data) => {
                        process.stdout.write('REMOTE: ' + data);
                    }).stderr.on('data', (data) => {
                        process.stderr.write('REMOTE ERR: ' + data);
                    });
                });
            });
        });
    });
}).on('error', (err) => {
    console.error("❌ Connection Error:", err.message);
    if (err.level === 'client-authentication') {
        console.error("   (Authentication failed. Check username/password)");
    }
}).connect(config);
