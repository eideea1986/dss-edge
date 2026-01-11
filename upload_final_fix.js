const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const files = [
    { local: 'local-api/server.js', remote: '/opt/dss-edge/local-api/server.js' },
    { local: 'update_camera_status.sh', remote: '/opt/dss-edge/update_camera_status.sh' }
];

const conn = new Client();
console.log("=== UPLOAD SERVER AND CRON FIX ===");

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        let uploaded = 0;
        files.forEach(file => {
            const localPath = path.resolve(file.local);
            const content = fs.readFileSync(localPath);

            console.log(`📤 ${file.local}`);
            sftp.writeFile(file.remote, content, (err) => {
                if (err) console.error(`❌ ${file.local}:`, err);
                else console.log(`✅ ${file.local}`);

                uploaded++;
                if (uploaded === files.length) {
                    console.log("\n🔄 Restarting dss-edge...");
                    conn.exec('systemctl restart dss-edge && sleep 5 && /opt/dss-edge/update_camera_status.sh', (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.on('close', () => {
                            console.log("\n✅ All set. Status should be ONLINE now.");
                            conn.end();
                        });
                    });
                }
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
