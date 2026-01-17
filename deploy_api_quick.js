const { Client } = require('ssh2');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;
        const local = path.join(__dirname, 'local-api/server.js');
        const remote = '/opt/dss-edge/local-api/server.js';
        console.log("Uploading modified server.js...");
        sftp.fastPut(local, remote, (err) => {
            if (err) throw err;
            console.log("✅ SERVER.JS UPDATED.");
            conn.end();
        });
    });
}).connect(config);
