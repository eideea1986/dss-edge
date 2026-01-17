const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        const content = fs.readFileSync(localPath);
        sftp.writeFile(remotePath, content, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

conn.on('ready', () => {
    conn.sftp(async (err, sftp) => {
        if (err) throw err;
        try {
            console.log("1. Uploading fresh Recorder C++ & CMake...");
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/recorder_cpp/recorder.cpp'),
                '/opt/dss-edge/recorder_cpp/recorder.cpp'
            );
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/recorder_cpp/CMakeLists.txt'),
                '/opt/dss-edge/recorder_cpp/CMakeLists.txt'
            );

            console.log("2. Forcing CLEAN rebuild...");
            await new Promise((resolve) => {
                conn.exec('rm -rf /opt/dss-edge/recorder_cpp/build && mkdir -p /opt/dss-edge/recorder_cpp/build && cd /opt/dss-edge/recorder_cpp/build && cmake .. && make -j$(nproc)', (err, stream) => {
                    stream.on('close', resolve);
                    stream.stdout.on('data', d => process.stdout.write(d));
                    stream.stderr.on('data', d => process.stderr.write(d));
                });
            });

            console.log("3. Uploading Orchestrator...");
            await uploadFile(sftp,
                path.join(__dirname, 'recorder_deploy/orchestrator/orchestrator.js'),
                '/opt/dss-edge/orchestrator/orchestrator.js'
            );

            console.log("4. Uploading Playback Controller...");
            await uploadFile(sftp,
                path.join(__dirname, 'local-api/playback/playbackController.js'),
                '/opt/dss-edge/local-api/playback/playbackController.js'
            );

            console.log("5. Uploading go2rtc & Device Management...");
            await uploadFile(sftp,
                path.join(__dirname, 'camera-manager/go2rtcUtils.js'),
                '/opt/dss-edge/camera-manager/go2rtcUtils.js'
            );
            await uploadFile(sftp,
                path.join(__dirname, 'camera-manager/src/DeviceManager.js'),
                '/opt/dss-edge/camera-manager/src/DeviceManager.js'
            );

            console.log("6. Restarting all...");
            conn.exec('systemctl restart dss-recorder dss-edge', (err, stream) => {
                stream.on('close', () => {
                    console.log("🚀 DEPLOY SUCCESSFUL.");
                    conn.end();
                });
            });

        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
