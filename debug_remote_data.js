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

    // 1. Check Cameras Config for Zones
    conn.exec('cat /opt/dss-edge/config/cameras.json', (err, stream) => {
        stream.on('data', (d) => {
            console.log('\n--- REMOTE CAMERAS.JSON ---');
            process.stdout.write(d);
        });
        stream.on('close', () => {
            // 2. Check Logs for errors/startup
            conn.exec('pm2 logs dss-edge-api --lines 50 --nostream', (err, stream2) => {
                stream2.on('data', (d) => process.stdout.write(d));
                stream2.on('close', () => conn.end());
            });
        });
    });
}).connect(config);
