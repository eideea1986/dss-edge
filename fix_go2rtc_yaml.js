const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== FIXING GO2RTC UTILS AND REGENERATING CONFIG ===");

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const content = fs.readFileSync(path.resolve('camera-manager/go2rtcUtils.js'));
        sftp.writeFile('/opt/dss-edge/camera-manager/go2rtcUtils.js', content, (err) => {
            if (err) throw err;
            console.log("✅ go2rtcUtils.js updated.");

            // Now trigger a regeneration by calling a script that uses it
            const regenCmd = `node -e "const gu = require('/opt/dss-edge/camera-manager/go2rtcUtils'); const store = require('/opt/dss-edge/local-api/store/cameraStore'); gu.generateConfig(store.list());"`;

            conn.exec(regenCmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', () => {
                    console.log("✅ YAML Regenerated.");

                    conn.exec('systemctl restart dss-go2rtc dss-edge', (err, stream) => {
                        stream.on('close', () => {
                            console.log("✅ Services Restarted.");
                            conn.end();
                        });
                    });
                });
            });
        });
    });
}).on('error', (err) => console.error(err)).connect(config);
