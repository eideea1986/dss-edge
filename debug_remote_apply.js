const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready');

    // 1. Check Process List
    conn.exec('pm2 list', (err, stream) => {
        if (err) throw err;
        stream.on('data', (d) => {
            console.log('\n--- PM2 LIST ---');
            process.stdout.write(d);
        });
        stream.on('close', () => {
            // 2. Check File Content
            conn.exec('grep -n "normalizeZone" /opt/dss-edge/local-api/services/aiRequest.js', (err, stream2) => {
                stream2.on('data', (d) => {
                    console.log('\n--- FILE CHECK (normalizeZone) ---');
                    process.stdout.write(d);
                });
                stream2.on('close', () => {
                    // 3. Check Edge Config
                    conn.exec('cat /opt/dss-edge/config/edge.json', (err, stream3) => {
                        stream3.on('data', (d) => {
                            console.log('\n--- EDGE CONFIG ---');
                            process.stdout.write(d);
                        });
                        stream3.on('close', () => conn.end());
                    });
                });
            });
        });
    });
}).connect(config);
