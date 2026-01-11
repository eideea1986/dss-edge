const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== CHECK ORCHESTRATOR ON SERVER ===");

conn.on('ready', () => {
    conn.exec('grep -n "updateGo2RTC\\|Generate Go2RTC" /opt/dss-edge/orchestrator/edgeOrchestrator.js', (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n--- If output above is empty, orchestrator is clean. ---");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
