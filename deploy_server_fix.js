const { Client } = require('ssh2');
const fs = require('fs');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;
        const localPath = 'i:/dispecerat/github_release/dss-edge/local-api/server.js';
        const remotePath = '/opt/dss-edge/local-api/server.js';

        console.log('Uploading server.js...');
        sftp.fastPut(localPath, remotePath, (err) => {
            if (err) {
                console.error('Upload failed:', err);
                return conn.end();
            }
            console.log('Uploaded server.js');

            console.log('Restarting dss-edge service...');
            conn.exec('systemctl restart dss-edge', (err, stream) => {
                stream.on('data', d => console.log('OUT:', d.toString()));
                stream.on('stderr', d => console.log('ERR:', d.toString()));
                stream.on('close', () => {
                    console.log('Service restarted');
                    conn.end();
                });
            });
        });
    });
}).connect(config);
