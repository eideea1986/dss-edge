const { Client } = require('ssh2');
const fs = require('fs');
const { exec } = require('child_process');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_TAR = 'api_selective.tar';
const REMOTE_TAR = '/tmp/api_selective.tar';
const TARGET_DIR = '/opt/dss-edge/local-api';

console.log("Packaging local-api (Selective)...");
// Explicitly list updated folders/files. Note: Paths are relative to -C (local-api)
const items = "playback routes services server.js";

// Windows tar needs careful handling. Assuming Git Bash tar or system tar.
exec(`tar -cf ${LOCAL_TAR} -C local-api ${items}`, (err, stdout, stderr) => {
    if (err) {
        console.error("Tar fail:", stderr);
        // Continue anyway if tar generated something? No, risky. 
        // Windows 'tar' is bsdtar.
        // If it fails, we abort.
        return;
    }

    const conn = new Client();
    conn.on('ready', () => {
        console.log('SSH Ready - Deploying Selective API Update');
        conn.sftp((err, sftp) => {
            if (err) throw err;
            sftp.fastPut(LOCAL_TAR, REMOTE_TAR, (err) => {
                if (err) throw err;
                console.log("Uploaded. Extracting & Restarting API...");

                const cmd = `
                    tar -xf ${REMOTE_TAR} -C ${TARGET_DIR}
                    pm2 restart dss-edge-api
                `;

                conn.exec(cmd, (err, stream) => {
                    if (err) throw err;
                    stream.on('close', (code) => {
                        console.log('Update Complete. Code: ' + code);
                        conn.end();
                    }).on('data', d => process.stdout.write(d));
                });
            });
        });
    }).connect(config);
});
