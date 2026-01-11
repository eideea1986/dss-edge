const { Client } = require('ssh2');
const fs = require('fs');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;
        const localPath = 'i:/dispecerat/github_release/dss-edge/local-api/routes/status.js';
        const remotePath = '/opt/dss-edge/local-api/routes/status.js';

        sftp.fastPut(localPath, remotePath, (err) => {
            if (err) throw err;
            console.log('Uploaded status.js');

            conn.exec('sudo systemctl restart dss-edge', (err, stream) => {
                stream.on('close', () => conn.end());
            });
        });
    });
}).connect(config);
