const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK GO2RTC DETAILED STREAMS ===");

conn.on('ready', () => {
    conn.exec('curl -s http://127.0.0.1:1984/api/streams', (err, stream) => {
        if (err) throw err;
        let data = "";
        stream.on('data', d => data += d);
        stream.on('close', () => {
            try {
                const info = JSON.parse(data);
                // Print first 2 streams info
                const keys = Object.keys(info);
                keys.slice(0, 5).forEach(k => {
                    console.log(`Stream: ${k}`);
                    console.log(JSON.stringify(info[k], null, 2));
                });
            } catch (e) { console.error(e); }
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
