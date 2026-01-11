const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

console.log("=== LOG CHECK .145 & .146 ===");

conn.on('ready', () => {
    // Check logs for Probe activity and ffmpeg errors related to these IPs
    const cmd = 'journalctl -u dss-edge --since "10 minutes ago" --no-pager | grep -E "145|146|Probe|AddCamera"';

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        });
    });
}).on('error', (err) => {
    console.error("Connection Error:", err);
}).connect(config);
