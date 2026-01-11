const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK API RESPONSE ===");

conn.on('ready', () => {
    conn.exec('curl -s http://127.0.0.1:8080/cameras/config | jq ".[0:3] | .[] | {ip, status}"', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n--- If status is ONLINE above, backend is OK. UI needs refresh or cache clear. ---");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
