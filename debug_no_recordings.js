const { Client } = require('ssh2');
const conn = new Client();

const problematicCameras = [
    'cam_147c8a7a',
    'cam_34b5a397',
    'cam_3aae9a4d',
    'cam_4c5cf487',
    'cam_6e170adf',
    'cam_80316838',
    'cam_e4a9af3b'
];

console.log('=== Checking problematic cameras ===\n');

conn.on('ready', () => {
    let index = 0;

    function checkNext() {
        if (index >= problematicCameras.length) {
            conn.end();
            return;
        }

        const camId = problematicCameras[index];
        const cmd = `sqlite3 /opt/dss-edge/storage/${camId}/index.db "SELECT COUNT(*), MIN(start_ts), MAX(start_ts), MIN(end_ts), MAX(end_ts) FROM segments"`;

        conn.exec(cmd, (err, stream) => {
            let output = '';
            stream.on('data', d => output += d.toString());
            stream.on('close', () => {
                console.log(`${camId}: ${output.trim()}`);
                index++;
                checkNext();
            });
        });
    }

    checkNext();
}).connect({
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
});
