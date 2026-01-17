const { Client } = require('ssh2');
const fs = require('fs');
const { exec } = require('child_process');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_TAR = 'api_update.tar';
const REMOTE_TAR = '/tmp/api_update.tar';
const TARGET_DIR = '/opt/dss-edge/local-api';

console.log("Packaging local-api...");
// Pack everything in local-api except node_modules
exec(`tar -cf ${LOCAL_TAR} -C local-api . --exclude=node_modules`, (err, stdout, stderr) => {
    if (err) {
        console.error("Tar fail:", stderr);
        return;
    }

    const conn = new Client();
    conn.on('ready', () => {
        console.log('SSH Ready - Deploying Full API Update');
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
