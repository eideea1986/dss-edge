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
                    console.error('STDERR:', stderr);
                    return reject(new Error(`Command failed with code ${code}`));
                }
                resolve(stdout);
            });
        });
    });
}

conn.on('ready', async () => {
    try {
        console.log('=== DeployingSupervisor ===\n');

        // 1. Create directory
        console.log('1. Creating supervisor directory...');
        await execCommand(conn, 'mkdir -p /opt/dss-edge/supervisor_cpp');

        // 2. Upload supervisor files
        console.log('2. Uploading supervisor files...');
        const files = [
            'Process.hpp',
            'Heartbeat.hpp',
            'Logger.hpp',
            'supervisor.cpp',
            'CMakeLists.txt'
        ];

        const sftp = await new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
        });

        for (const file of files) {
            const localPath = path.join('i:/dispecerat/github_release/dss-edge/supervisor', file);
            const remotePath = `/opt/dss-edge/supervisor_cpp/${file}`;

            await new Promise((resolve, reject) => {
                sftp.fastPut(localPath, remotePath, (err) => {
                    if (err) return reject(err);
                    console.log(`  ✓ ${file}`);
                    resolve();
                });
            });
        }

        // 3. Compile supervisor
        console.log('\n3. Compiling supervisor...');
        await execCommand(conn, 'cd /opt/dss-edge/supervisor_cpp && mkdir -p build && cd build && cmake .. && make');

        // 4. Install binary
        console.log('4. Installing supervisor binary...');
        await execCommand(conn, 'cp /opt/dss-edge/supervisor_cpp/build/dss-supervisor /usr/bin/dss-supervisor');
        await execCommand(conn, 'chmod +x /usr/bin/dss-supervisor');

        // 5. Upload and install systemd service
        console.log('5. Installing systemd service...');
        const serviceLocal = 'i:/dispecerat/github_release/dss-edge/dss-supervisor.service';
        const serviceRemote = '/tmp/dss-supervisor.service';

        await new Promise((resolve, reject) => {
            sftp.fastPut(serviceLocal, serviceRemote, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        await execCommand(conn, 'mv /tmp/dss-supervisor.service /etc/systemd/system/dss-supervisor.service');
        await execCommand(conn, 'systemctl daemon-reload');

        console.log('\n✅ Supervisor deployed successfully!');
        console.log('\nTo enable and start:');
        console.log('  systemctl enable dss-supervisor');
        console.log('  systemctl start dss-supervisor');
        console.log('  systemctl status dss-supervisor');

        conn.end();
    } catch (err) {
        console.error('❌ Deployment failed:', err.message);
        conn.end();
    }
}).connect(config);
