const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== WAIT FOR CRON THEN RESTART ===");

conn.on('ready', () => {
    console.log("Waiting 90 seconds for cron to run...");
    setTimeout(() => {
        console.log("Restarting dss-edge now...");
        conn.exec('systemctl restart dss-edge', (err, stream) => {
            stream.on('close', () => {
                console.log("✅ Restarted after cron updated file. Wait 10s then refresh browser.");
                conn.end();
            });
        });
    }, 90000); // 90 seconds
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
