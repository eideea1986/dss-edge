const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

console.log("=== REMOTE FIX: node-fetch incompatibility ===");

conn.on('ready', () => {
    console.log('✅ SSH Connected');

    // 1. Fix Package
    // 2. Restart Service
    // 3. Monitor Log for a few seconds
    const cmd = 'cd /opt/dss-edge/local-api && npm install node-fetch@2 --save && systemctl restart dss-edge';

    console.log(`🚀 Executing: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;

        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));

        stream.on('close', (code) => {
            console.log(`\n✅ Fix Command Completed (Code: ${code})`);

            // Check status immediately
            conn.exec('systemctl status dss-edge --no-pager', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => conn.end());
            });
        });
    });
}).on('error', (err) => {
    console.error("Connection Error:", err);
}).connect(config);
