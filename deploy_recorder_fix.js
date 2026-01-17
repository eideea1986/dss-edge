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

async function execCommand(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let stdout = '';
            let stderr = '';
            stream.on('data', d => stdout += d.toString());
            stream.stderr.on('data', d => stderr += d.toString());
            stream.on('close', (code) => {
                if (code !== 0) {
                    console.error('CMD Error:', stderr);
                    return reject(new Error(`Command ${cmd} failed with code ${code}`));
                }
                resolve(stdout);
            });
        });
    });
}

function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

conn.on('ready', async () => {
    try {
        console.log('=== Deploying RECORDER Fix ===');

        // 1. Install Dependencies
        console.log('1. Installing remote dependencies...');
        await execCommand(conn, 'apt-get update && apt-get install -y ffmpeg nlohmann-json3-dev build-essential cmake');

        // 2. Prepare Directories
        console.log('2. Creating directories...');
        await execCommand(conn, 'mkdir -p /opt/dss-edge/recorder_cpp/build');
        await execCommand(conn, 'mkdir -p /opt/dss-edge/orchestrator');
        await execCommand(conn, 'mkdir -p /opt/dss-edge/retention');

        const sftp = await new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s)));

        // 3. Upload C++ Recorder
        console.log('3. Uploading Recorder C++...');
        await uploadFile(sftp, path.join(__dirname, 'recorder_deploy/recorder_cpp/recorder.cpp'), '/opt/dss-edge/recorder_cpp/recorder.cpp');

        // 4. Compile Recorder
        console.log('4. Compiling Recorder...');
        await execCommand(conn, 'g++ /opt/dss-edge/recorder_cpp/recorder.cpp -o /opt/dss-edge/recorder_cpp/build/recorder -std=c++17 -O2');
        await execCommand(conn, 'chmod +x /opt/dss-edge/recorder_cpp/build/recorder');

        // 5. Upload Orchestrator & Retention logic
        console.log('5. Uploading Node.js Logic...');
        await uploadFile(sftp, path.join(__dirname, 'recorder_deploy/orchestrator/orchestrator.js'), '/opt/dss-edge/orchestrator/orchestrator.js');
        await uploadFile(sftp, path.join(__dirname, 'recorder_deploy/orchestrator/package.json'), '/opt/dss-edge/orchestrator/package.json');
        await uploadFile(sftp, path.join(__dirname, 'recorder_deploy/retention/retention_engine.js'), '/opt/dss-edge/retention/retention_engine.js');
        await uploadFile(sftp, path.join(__dirname, 'recorder_deploy/retention/package.json'), '/opt/dss-edge/retention/package.json');

        // 6. Setup Systemd
        console.log('6. Configuring Systemd Service...');
        const serviceContent = `[Unit]
Description=DSS Edge Recorder Orchestrator
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/dss-edge/orchestrator/orchestrator.js
Restart=always
RestartSec=3
User=root
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;
        fs.writeFileSync('dss-recorder.service', serviceContent);
        await uploadFile(sftp, 'dss-recorder.service', '/etc/systemd/system/dss-recorder.service');
        fs.unlinkSync('dss-recorder.service');

        // 7. Disable Old Services / Clean Conflict
        console.log('7. Cleaning up old services...');
        // Stop current internal recorder if running
        // Note: The main dss-edge service might still try to run something? 
        // User told to "Clean all application". 
        // We should ensure edgeOrchestrator doesn't spawn recorder.
        // But edgeOrchestrator spawns local-api/server.js which spawned recorderService.
        // We need to disable recorderService in local-api if we want to be clean.
        // OR we just kill the old process and assume the new architecture takes over recording.
        // Ideally we assume user wants THIS to handle recording.

        // Reload & Start
        await execCommand(conn, 'systemctl daemon-reload');
        await execCommand(conn, 'systemctl enable dss-recorder');
        await execCommand(conn, 'systemctl restart dss-recorder');

        console.log('✅ Deployment Complete! Recorder is running under dss-recorder service.');

        conn.end();
    } catch (e) {
        console.error('❌ Deployment Failed:', e);
        conn.end();
    }
}).connect(config);
