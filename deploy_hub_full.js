const Client = require('ssh2').Client;
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.205',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const localHubPath = path.resolve(__dirname, '../dss-hub');
const remoteApiDir = '/opt/dss-hub-api';
const remoteUiDir = '/opt/dss-hub-ui/build';

// Recursive function to get all files in a directory
function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            arrayOfFiles.push(path.join(dirPath, "/", file));
        }
    });
    return arrayOfFiles;
}

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Connected to HUB (205). Starting Deployment...');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const tasks = [];

        // 1. API Server
        tasks.push({
            local: path.join(localHubPath, 'hub-api/server.js'),
            remote: path.posix.join(remoteApiDir, 'server.js')
        });

        // 2. UI Build Files
        const localBuildDir = path.join(localHubPath, 'hub-ui/build');
        if (fs.existsSync(localBuildDir)) {
            const buildFiles = getAllFiles(localBuildDir);
            buildFiles.forEach(file => {
                const relative = path.relative(localBuildDir, file).replace(/\\/g, '/');
                tasks.push({
                    local: file,
                    remote: path.posix.join(remoteUiDir, relative),
                    isUi: true
                });
            });
        }

        let completed = 0;
        let errors = 0;

        // Helper to process queue
        const processNext = () => {
            if (tasks.length === 0) {
                console.log(`\nDeployment Complete. ${completed} files uploaded, ${errors} errors.`);
                // Restart Service
                conn.exec('systemctl restart dss-hub-api', (err, stream) => {
                    if (err) throw err;
                    stream.on('close', () => {
                        console.log('Service dss-hub-api restarted.');
                        conn.end();
                    }).stderr.on('data', (data) => console.log('STDERR: ' + data));
                });
                return;
            }

            const task = tasks.shift();
            // Ensure remote directory exists for UI files
            const remoteDir = path.posix.dirname(task.remote);

            // Simple logic to ensure dir exists (blindly try mkdir, ignore error)
            // But sftp.mkdir is async.
            // For simplicity in this environment, relying on existing structure or creating one by one.
            // Since structure is static (static/css, static/js), allow failure if exists.

            const doUpload = () => {
                sftp.fastPut(task.local, task.remote, (err) => {
                    if (err) {
                        console.error(`X Failed: ${task.local} -> ${task.remote}`, err.message);
                        errors++;
                    } else {
                        console.log(`V Uploaded: ${task.remote}`);
                        completed++;
                    }
                    processNext();
                });
            };

            if (task.isUi) {
                // Ensure directory
                sftp.mkdir(remoteDir, true, (err) => {
                    doUpload();
                });
            } else {
                doUpload();
            }
        };

        processNext();
    });
}).connect(config);
