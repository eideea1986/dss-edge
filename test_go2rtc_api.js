const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    // Add stream via API to test immediately
    const cmd = `curl -X PUT "http://127.0.0.1:1984/api/streams?src=test_144&dst=rtsp://admin:a1b2c3d4@192.168.120.144:554/Streaming/Channels/101"`;
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('close', () => {
            // Check status of the new stream
            setTimeout(() => {
                conn.exec('curl -s http://127.0.0.1:1984/api/streams?src=test_144', (err2, s2) => {
                    s2.on('data', d => console.log("Stream Status:", d.toString()));
                    s2.on('close', () => conn.end());
                });
            }, 2000);
        });
    });
}).connect(config);
