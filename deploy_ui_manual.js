const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const REMOTE_DIR = '/opt/dss-edge/local-ui/build';
const LOCAL_DIR = 'i:/dispecerat/github_release/dss-edge/local-ui/build';

const conn = new Client();

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    });
    return fileList;
}

conn.on('ready', () => {
    console.log('SSH Ready for UI Deployment');

    // Safety check: Don't deploy if build missing
    if (!fs.existsSync(LOCAL_DIR)) {
        console.error("Local build dir missing! Run npm run build first.");
        conn.end();
        return;
    }

    conn.sftp((err, sftp) => {
        if (err) throw err;

        // Helper to ensure remote dir exists
        const ensureDir = (dirPath, cb) => {
            // Create using exec implies using 'mkdir -p' which is easier than sftp.mkdir recursive
            conn.exec(`mkdir -p "${dirPath}"`, (err) => {
                if (err) console.error("Error creating dir:", dirPath, err);
                cb();
            });
        };

        const files = getAllFiles(LOCAL_DIR);
        let uploaded = 0;

        const processFile = (index) => {
            if (index >= files.length) {
                console.log(`\nDeployment Complete! Uploaded ${uploaded} files.`);
                // Clean cache of browser might be needed, but server handles no-cache for index.html
                conn.end();
                return;
            }

            const localPath = files[index];
            const relativePart = path.relative(LOCAL_DIR, localPath).replace(/\\/g, '/');
            const remotePath = `${REMOTE_DIR}/${relativePart}`.replace(/\\/g, '/');
            const remoteDir = path.dirname(remotePath);

            ensureDir(remoteDir, () => {
                sftp.fastPut(localPath, remotePath, (err) => {
                    if (err) {
                        console.error(`Failed to upload ${relativePart}:`, err.message);
                    } else {
                        process.stdout.write(`.`);
                        uploaded++;
                    }
                    processFile(index + 1);
                });
            });
        };

        console.log(`Deploying ${files.length} files to ${REMOTE_DIR}...`);
        processFile(0);
    });
}).connect(config);
