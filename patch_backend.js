const Client = require('ssh2').Client;
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const filesToPatch = [
    { local: 'local-api/playback/playbackController.js', remote: '/opt/dss-edge/local-api/playback/playbackController.js' },
    { local: 'local-api/routes/playback.js', remote: '/opt/dss-edge/local-api/routes/playback.js' },
    { local: 'local-api/playback/playbackStats.js', remote: '/opt/dss-edge/local-api/playback/playbackStats.js' },
    { local: 'camera-manager/src/RetentionManager.js', remote: '/opt/dss-edge/camera-manager/src/RetentionManager.js' }
];

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Connected. Patching Backend + Retention...');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        let pending = filesToPatch.length;
        filesToPatch.forEach(file => {
            sftp.fastPut(file.local, file.remote, (err) => {
                if (err) console.error(`Error uploading ${file.local}:`, err);
                else console.log(`Up: ${file.local} -> ${file.remote}`);
                pending--;
                if (pending === 0) {
                    console.log('✅ BACKEND & RETENTION PATCH SUCCESSFUL');
                    conn.end();
                }
            });
        });
    });
}).connect(config);
