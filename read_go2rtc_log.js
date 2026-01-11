const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.exec('journalctl -u dss-go2rtc -n 50 --no-pager', (err, stream) => {
        let log = "";
        stream.on('data', d => log += d);
        stream.on('close', () => {
            console.log("=== GO2RTC LOGS ===");
            console.log(log);
            conn.end();
        });
    });
}).connect(config);
