const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_PATH = 'i:/dispecerat/github_release/dss-edge/camera-manager/armingLogic.js';
const REMOTE_DIR = '/opt/dss-edge/camera-manager/';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Deploying Arming Logic');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastPut(LOCAL_PATH, REMOTE_DIR + 'armingLogic.js', (err) => {
            if (err) throw err;
            console.log("Uploaded.");
            conn.exec('pm2 restart dss-edge-api', (err, stream) => {
                stream.on('close', () => conn.end());
            });
        });
    });
}).connect(config);
