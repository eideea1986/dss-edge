const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const files = [
    { local: 'local-api/store/cameraStore.js', remote: '/opt/dss-edge/local-api/store/cameraStore.js' },
    { local: 'local-ui/src/pages/Live.js', remote: '/opt/dss-edge/local-ui/src/pages/Live.js' } // This is SOURCE, not build. 
];

// Wait, local-ui/src/pages/Live.js is source. To fix UI, I need to rebuild or just update the build/static/js...
// But rebuilding locally and uploading build/ is better.

console.log("=== UPLOAD BACKEND FIX ===");

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const content = fs.readFileSync(path.resolve('local-api/store/cameraStore.js'));
        sftp.writeFile('/opt/dss-edge/local-api/store/cameraStore.js', content, (err) => {
            if (err) throw err;
            console.log("✅ cameraStore.js updated on server.");

            conn.exec('systemctl restart dss-edge', (err, stream) => {
                stream.on('close', () => {
                    console.log("✅ dss-edge restarted.");
                    conn.end();
                });
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
