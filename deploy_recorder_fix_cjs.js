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
            console.log("Fixing module types (Switching to CJS)...");

            // 1. Upload new CJS versions
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/orchestrator/orchestrator.js'),
                '/opt/dss-edge/orchestrator/orchestrator.js'
            );
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/retention/retention_engine.js'),
                '/opt/dss-edge/retention/retention_engine.js'
            );

            // 2. DELETE conflicting package.json files
            console.log("Removing conflicting package.json files...");
            conn.exec('rm /opt/dss-edge/orchestrator/package.json /opt/dss-edge/retention/package.json', (err, stream) => {
                if (err) throw err;
                stream.on('close', () => {
                    console.log("Conflicting files removed.");

                    // 3. Restart everything
                    console.log("Restarting ALL services...");
                    conn.exec('systemctl restart dss-edge && systemctl restart dss-recorder', (err2, stream2) => {
                        stream2.on('close', () => {
                            console.log("Services restarted.");
                            conn.end();
                        });
                    });
                });
            });

        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
