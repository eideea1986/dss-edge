const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Restoring Video Streams');

    // Commands to force regeneration of streams
    const cmds = [
        // 1. Restart Orchestrator (it should generate config on start)
        'pm2 restart dss-edge-orch',

        // 2. Wait a bit then restart Go2RTC
        'sleep 5',
        'systemctl restart dss-go2rtc',

        // 3. Confirm Go2RTC is UP
        'sleep 2',
        'netstat -tuln | grep 1984', // Check API port
        'netstat -tuln | grep 8554'  // Check RTSP port
    ];

    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) throw err;
        stream.on('data', (d) => process.stdout.write(d));
        stream.on('close', () => {
            console.log("Stream Restoration Sequence Complete.");
            conn.end();
        });
    });
}).connect(config);
