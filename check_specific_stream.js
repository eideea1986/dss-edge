const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK CAM_34B5A397 STATUS ===");

conn.on('ready', () => {
    conn.exec('curl -s http://127.0.0.1:1984/api/streams?src=cam_34b5a397', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            console.log(data);
            conn.end();
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
