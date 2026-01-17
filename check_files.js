const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const camId = 'cam_34b5a397';
const conn = new Client();
conn.on('ready', () => {
    console.log(`Checking files for ${camId}...`);

    conn.exec(`ls -lh /opt/dss-edge/storage/${camId}/2026-01-15 | head -n 10`, (err, stream) => {
        if (err) throw err;
        stream.on('data', (d) => process.stdout.write(d));
        stream.on('close', () => conn.end());
    });

}).connect(config);
