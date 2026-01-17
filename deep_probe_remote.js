const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Starting Deep Probe');

    const cmds = [
        'echo "--- PROCESS CHECK ---"',
        'ps aux | grep node', // See running node processes
        'echo "--- PM2 STATUS ---"',
        'pm2 list',
        'echo "--- FILE CONTENT CHECK ---"',
        // Check specific signature present in my edits but likely missing in old version
        'grep "normalizeZone" /opt/dss-edge/local-api/services/aiRequest.js || echo "FAIL: normalizeZone NOT FOUND"',
        'grep "requiredClasses.size === 0" /opt/dss-edge/local-api/services/aiRequest.js || echo "FAIL: Class Update NOT FOUND"',
        'echo "--- LATEST LOGS ---"',
        'tail -n 20 /root/.pm2/logs/dss-edge-api-out.log',
        'tail -n 20 /root/.pm2/logs/dss-edge-api-error.log'
    ];

    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) throw err;
        stream.on('data', (d) => process.stdout.write(d));
        stream.on('close', () => conn.end());
    });
}).connect(config);
