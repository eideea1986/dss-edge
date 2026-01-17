const { Client } = require('ssh2');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

conn.on('ready', () => {
    conn.sftp(async (err, sftp) => {
        if (err) throw err;
        try {
            console.log("Uploading optimized aiRequest.js...");
            await uploadFile(sftp,
                path.join(__dirname, 'local-api/services/aiRequest.js'),
                '/opt/dss-edge/local-api/services/aiRequest.js'
            );

            console.log("Restarting services...");
            conn.exec('systemctl restart dss-edge', (err, stream) => {
                if (err) throw err;
                stream.on('close', () => {
                    console.log("dss-edge restarted.");
                    conn.end();
                });
            });
        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
