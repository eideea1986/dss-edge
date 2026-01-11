const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== REMOTE CLEANUP (KILL NODE) ===");

conn.on('ready', () => {
    // Kill all node processes to free port 8081, then start service cleanly
    const cmd = 'killall -9 node; sleep 2; systemctl restart dss-edge';
    console.log(`🚀 Executing: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
        if (err) {
            // killall might fail if no process found, which is fine
            console.log("Killall result: " + err.message);
        }

        stream.on('close', (code) => {
            console.log(`Cleanup done. Restarting service check...`);
            setTimeout(() => {
                conn.exec('systemctl status dss-edge --no-pager', (err, s) => {
                    s.pipe(process.stdout);
                    s.on('close', () => conn.end());
                });
            }, 3000);
        });
    });
}).on('error', (err) => {
    console.error("Connection Error:", err);
}).connect(config);
