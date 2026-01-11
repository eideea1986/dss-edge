const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const ips = ["192.168.120.145", "192.168.120.146"];
const user = "admin";
const pass = "TeamS_2k25!";

// Candidate list logic
function getCandidates(ip, u, p) {
    const auth = `${u}:${p}@${ip}:554`;
    return [
        `rtsp://${auth}/cam/realmonitor?channel=1&subtype=0`,
        `rtsp://${auth}/cam/realmonitor?channel=1&subtype=1`,
        `rtsp://${auth}/Streaming/Channels/101`,
        `rtsp://${auth}/Streaming/Channels/102`,
        `rtsp://${auth}/live/main`,
        `rtsp://${auth}/h264/ch1/main/av_stream`
    ];
}

const conn = new Client();
console.log("=== REMOTE PROBE TEST (145/146) ===");

conn.on('ready', () => {
    let chain = Promise.resolve();

    ips.forEach(ip => {
        chain = chain.then(() => new Promise(resolve => {
            console.log(`\n🔎 Probing ${ip}...`);
            const candidates = getCandidates(ip, user, pass);

            // Build a single command to try them one by one
            let script = "found=0; ";
            candidates.forEach(url => {
                // ffmpeg -t 3 (3 seconds timeout)
                // Grep for 'frame=' to detect success
                script += `if [ $found -eq 0 ]; then echo "Trying ${url}..."; ffmpeg -rtsp_transport tcp -i "${url}" -t 3 -f null - 2>&1 | grep -q "frame=" && { echo "✅ SUCCESS: ${url}"; found=1; } || echo "❌ Failed"; fi; `;
            });
            script += `if [ $found -eq 0 ]; then echo "⚠️ All failed for ${ip}"; fi;`;

            conn.exec(script, (err, stream) => {
                if (err) throw err;
                stream.on('data', d => process.stdout.write(d));
                stream.on('close', () => resolve());
            });
        }));
    });

    chain.then(() => conn.end());

}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
