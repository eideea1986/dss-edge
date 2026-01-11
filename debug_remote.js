const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== NETWORK CHECK & LOG CHECK ===");

conn.on('ready', () => {
    // Check ports
    conn.exec('netstat -tulnp | grep 8080', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            // Check if server.js contains my emergency code
            console.log("\n--- Checking server.js content ---");
            conn.exec('grep "emergencyDelete" /opt/dss-edge/local-api/server.js', (err2, stream2) => {
                stream2.pipe(process.stdout);
                stream2.on('close', () => conn.end());
            });
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
