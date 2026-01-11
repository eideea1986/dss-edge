const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    // Check cam_3aae9a4d
    const cam = 'cam_3aae9a4d';
    const cmd = `sqlite3 /opt/dss-edge/storage/${cam}/index.db "SELECT * FROM segments;"`;
    console.log(`Checking ${cam}...`);
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log('DATA:', d.toString()));
        stream.on('stderr', d => console.log('ERR:', d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect(config);
