const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Executing Force Kill');

    // Find PID of server.js specifically
    const cmd = "ps aux | grep 'local-api/server.js' | grep -v grep | awk '{print $2}'";

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let pid = '';
        stream.on('data', (d) => { pid += d.toString().trim() + ' '; });
        stream.on('close', () => {
            pid = pid.trim();
            console.log(`Found PID(s): ${pid}`);

            if (pid) {
                // Kill it
                conn.exec(`kill -9 ${pid}`, (err, stream2) => {
                    stream2.on('close', () => {
                        console.log(`Killed PID ${pid}. Restarting PM2...`);
                        setTimeout(() => {
                            conn.exec('pm2 restart all', (err, stream3) => {
                                stream3.on('data', (d) => process.stdout.write(d));
                                stream3.on('close', () => conn.end());
                            });
                        }, 2000);
                    });
                });
            } else {
                console.log("No zombie process found. Just restarting PM2.");
                conn.exec('pm2 restart all', (err, stream3) => {
                    stream3.on('data', (d) => process.stdout.write(d));
                    stream3.on('close', () => conn.end());
                });
            }
        });
    });
}).connect(config);
