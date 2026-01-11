const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const targetIp = "192.168.120.145";
const user = "admin";
const pass = "a1b2c3d4";
const url = `rtsp://${user}:${pass}@${targetIp}:554/cam/realmonitor?channel=1&subtype=0`;

const conn = new Client();
console.log(`=== SINGLE PROBE TEST: ${url} ===`);

conn.on('ready', () => {
    console.log(`\n🔎 Testing ${targetIp}...`);
    // Using simple ffmpeg frame check
    const cmd = `ffmpeg -rtsp_transport tcp -i "${url}" -t 5 -f null - 2>&1 | grep "frame="`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let output = "";
        stream.on('data', d => {
            output += d.toString();
            process.stdout.write(d);
        });
        stream.on('close', (code) => {
            if (output.includes("frame=")) {
                console.log("\n✅ SUCCESS: Stream is working!");
            } else {
                console.log("\n❌ FAILED: No frames received.");
            }
            conn.end();
        });
    });

}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
