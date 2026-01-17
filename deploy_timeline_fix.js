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
            console.log("Uploading Orchestrator (SQLite Mode)...");
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/orchestrator/orchestrator.js'),
                '/opt/dss-edge/orchestrator/orchestrator.js'
            );

            console.log("Uploading Retention Engine (SQLite Sync)...");
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/retention/retention_engine.js'),
                '/opt/dss-edge/retention/retention_engine.js'
            );

            console.log("Uploading Migration Script...");
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/migrate_db.js'),
                '/tmp/migrate_db.js'
            );

            console.log("Executing migration and restarting...");
            conn.exec('export NODE_PATH=/opt/dss-edge/local-api/node_modules && node /tmp/migrate_db.js && systemctl restart dss-recorder', (err, stream) => {
                if (err) throw err;
                stream.on('close', () => {
                    console.log("Migration and Restart Complete.");
                    conn.end();
                });
                stream.stdout.on('data', d => console.log(d.toString()));
                stream.stderr.on('data', d => console.error(d.toString()));
            });

        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
