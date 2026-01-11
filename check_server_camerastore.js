const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK SERVER CAMERASTORE CODE ===");

conn.on('ready', () => {
    conn.exec('grep -n "c.status = " /opt/dss-edge/local-api/store/cameraStore.js', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n--- If line says 'c.status = \"OFFLINE\"' then old code is still there. ---");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
