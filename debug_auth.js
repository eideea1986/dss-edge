const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    // Testing both possible passwords for Hikvision 144
    const cmd = `
    echo "--- Testing a1b2c3d4 ---" && \
    curl -v --connect-timeout 5 "rtsp://admin:a1b2c3d4@192.168.120.144:554/Streaming/Channels/101" 2>&1 | grep "401 Unauthorized" || echo "Login OK"
    echo "--- Testing admin ---" && \
    curl -v --connect-timeout 5 "rtsp://admin:admin@192.168.120.144:554/Streaming/Channels/101" 2>&1 | grep "401 Unauthorized" || echo "Login OK"
    `;
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect(config);
