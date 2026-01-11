const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Config
const REMOTE_HOST = '192.168.120.208';
const REMOTE_USER = 'root';
const REMOTE_PASS = 'TeamS_2k25!';
const REMOTE_DEST = '/opt/dss-edge/local-ui/build';
const LOCAL_BUILD = path.join(__dirname, 'local-ui/build');
const TAR_NAME = 'ui_build.tar';

function runLocalTar() {
    return new Promise((resolve, reject) => {
        console.log('📦 Archiving local build...');
        // Windows tar syntax: tar -cf archive.tar -C source_dir .
        const cmd = `tar -cf ${TAR_NAME} -C "${LOCAL_BUILD}" .`;
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.error('Tar Error:', stderr);
                reject(err);
            } else {
                console.log('✅ Archive created:', TAR_NAME);
                resolve();
            }
        });
    });
}

function deploy() {
    const conn = new Client();

    conn.on('ready', () => {
        console.log('🔌 SSH Connected.');

        // 1. Upload TAR
        const localTarPath = path.join(__dirname, TAR_NAME);
        const remoteTarPath = `/tmp/${TAR_NAME}`;

        console.log(`📤 Uploading ${TAR_NAME} to ${remoteTarPath}...`);

        conn.sftp((err, sftp) => {
            if (err) throw err;

            sftp.fastPut(localTarPath, remoteTarPath, {}, (err) => {
                if (err) throw err;
                console.log('✅ Upload complete.');

                // 2. Extract Remote
                const commands = [
                    `echo "🧹 Cleaning destination..."`,
                    `rm -rf ${REMOTE_DEST}/*`,
                    `mkdir -p ${REMOTE_DEST}`,

                    `echo "📦 Extracting..."`,
                    `tar -xf ${remoteTarPath} -C ${REMOTE_DEST}`,

                    `echo "🗑️ Removing temp archive..."`,
                    `rm ${remoteTarPath}`,

                    `echo "🔄 Restarting Service..."`,
                    `pm2 restart dss-edge`
                ].join(' && ');

                console.log('🚀 Executing remote commands...');

                conn.exec(commands, (err, stream) => {
                    if (err) throw err;
                    stream.on('close', (code, signal) => {
                        console.log(`✅ DEPLOY FINISHED with code ${code}`);
                        conn.end();
                        // Delete local tar
                        fs.unlinkSync(localTarPath);
                    }).on('data', (data) => {
                        console.log('REMOTE: ' + data);
                    }).stderr.on('data', (data) => {
                        console.log('STDERR: ' + data);
                    });
                });
            });
        });
    }).connect({
        host: REMOTE_HOST,
        port: 22,
        username: REMOTE_USER,
        password: REMOTE_PASS
    });
}

// Main
if (!fs.existsSync(LOCAL_BUILD)) {
    console.error('❌ Build folder missing. Run "npm run build" first.');
} else {
    runLocalTar().then(deploy).catch(console.error);
}
