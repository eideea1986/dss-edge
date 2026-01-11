const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== DISABLE AUTO-GENERATION IN ORCHESTRATOR ===");

conn.on('ready', () => {
    // Comment out the go2rtc generation lines in orchestrator
    const cmd = `
        sed -i '/Generate Go2RTC/,/updateGo2RTC/s/^/\\/\\/ /' /opt/dss-edge/orchestrator/edgeOrchestrator.js
        systemctl restart dss-edge
        sleep 3
        echo "Orchestrator patched. Config generation disabled."
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log("\n✅ Auto-generation disabled. Now create manual config...");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
