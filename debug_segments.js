const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    // Check segments for the camera we failed to playback
    const cam = 'cam_00e5d3a3';
    const cmd = `sqlite3 /opt/dss-edge/storage/${cam}/index.db "SELECT id, file, start_ts, end_ts FROM segments ORDER BY id DESC LIMIT 10;"`;

    console.log(`Querying DB for ${cam}...`);
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log('DB ROW:', d.toString().trim()));
        stream.on('stderr', d => console.error('DB ERR:', d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect(config);
