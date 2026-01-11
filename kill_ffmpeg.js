const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== KILLING ALL FFMPEG PROCESSES ===");

conn.on('ready', () => {
    conn.exec('killall -9 ffmpeg', (err, stream) => {
        if (err) { console.log("No ffmpeg processes found or killall missing."); }

        stream.on('close', () => {
            console.log("✅ FFmpeg processes cleared. RTSP sessions should reset.");
            conn.end();
        });
    });
}).on('error', (err) => {
    console.error("Connection Error:", err);
}).connect(config);
