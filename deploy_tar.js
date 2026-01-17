const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_TAR = 'i:/dispecerat/github_release/dss-edge/playback_fix.tar';
const REMOTE_TAR = '/tmp/playback_fix.tar';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Deploying TAR');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        sftp.fastPut(LOCAL_TAR, REMOTE_TAR, (err) => {
            if (err) throw err;
            console.log("TAR Uploaded. Extracting...");

            const cmd = 'tar -xf /tmp/playback_fix.tar -C /opt/dss-edge/local-api/playback/ && rm /tmp/playback_fix.tar && pm2 restart dss-edge-api';

            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    console.log('Extraction & Restart Complete. Code: ' + code);
                    conn.end();
                }).on('data', (data) => {
                    console.log('STDOUT: ' + data);
                }).stderr.on('data', (data) => {
                    console.log('STDERR: ' + data);
                });
            });
        });
    });
}).connect(config);
