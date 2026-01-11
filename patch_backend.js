const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const LOCAL_ROOT = path.join(__dirname, 'local-api');
const REMOTE_ROOT = '/opt/dss-edge/local-api';

const FILES_TO_PATCH = [
    'playback/playbackController.js',
    'playback/playbackStats.js',
    'routes/playback.js'
];

conn.on('ready', () => {
    console.log('SSH Connected. Patching Backend...');

    let pending = FILES_TO_PATCH.length;

    conn.sftp((err, sftp) => {
        if (err) throw err;

        FILES_TO_PATCH.forEach(relPath => {
            const localPath = path.join(LOCAL_ROOT, relPath);
            const remotePathStr = REMOTE_ROOT + '/' + relPath.replace(/\\/g, '/');

            sftp.fastPut(localPath, remotePathStr, (err) => {
                if (err) console.error(`Failed to upload ${relPath}:`, err);
                else console.log(`Up: ${relPath}`);

                pending--;
                if (pending === 0) {
                    console.log('✅ BACKEND PATCH SUCCESSFUL');
                    conn.end();
                }
            });
        });
    });
}).connect({
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
});
