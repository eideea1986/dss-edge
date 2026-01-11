const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    // Find first camera dir
    conn.exec('ls -1 /opt/dss-edge/storage | head -n 1', (err, stream) => {
        let camBuf = '';
        stream.on('data', d => camBuf += d.toString());
        stream.on('close', () => {
            const cam = camBuf.trim();
            if (!cam) { console.log('No cameras found'); conn.end(); return; }

            console.log(`Checking DB for ${cam}...`);
            const cmd = `sqlite3 /opt/dss-edge/storage/${cam}/index.db "SELECT * FROM segments;"`;
            conn.exec(cmd, (err2, s2) => {
                s2.on('data', d => console.log('SEGMENTS:', d.toString()));
                s2.on('stderr', d => console.error('ERR:', d.toString()));
                s2.on('close', () => conn.end());
            });
        });
    });
}).connect(config);
