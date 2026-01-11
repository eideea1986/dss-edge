const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    // Testing admin:a1b2c3d4 on 143
    const cmd = `curl -v -X OPTIONS "rtsp://admin:a1b2c3d4@192.168.120.143:554/Streaming/Channels/101" 2>&1`;
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect(config);
