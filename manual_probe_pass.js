const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const ips = ["192.168.120.145", "192.168.120.146"];
const user = "admin";
const pass = "a1b2c3d4";

// Minimal Trassir logic again
function getCandidates(ip, u, p) {
    const auth = `${u}:${p}@${ip}:554`;
    return [
        `rtsp://${auth}/cam/realmonitor?channel=1&subtype=0`, // Dahua Standard
        `rtsp://${auth}/cam/realmonitor?channel=1&subtype=1`, // Dahua Sub
        `rtsp://${auth}/Streaming/Channels/101`, // Hikvision
        `rtsp://${auth}/live/main`
    ];
}

const conn = new Client();
console.log(`=== TEST PASSWORD: ${pass} ===`);

conn.on('ready', () => {
    let chain = Promise.resolve();

    ips.forEach(ip => {
        chain = chain.then(() => new Promise(resolve => {
            console.log(`\n🔎 Testing ${ip}...`);
            const candidates = getCandidates(ip, user, pass);

            let script = "found=0; ";
            candidates.forEach(url => {
                script += `if [ $found -eq 0 ]; then ffmpeg -rtsp_transport tcp -i "${url}" -t 2 -f null - 2>&1 | grep -q "frame=" && { echo "✅ MATCH: ${url}"; found=1; }; fi; `;
            });
            script += `if [ $found -eq 0 ]; then echo "❌ Failed with ${pass}"; fi;`;

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
