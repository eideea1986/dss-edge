const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_TAR = 'i:/dispecerat/github_release/dss-edge/ui_build_v2.tar';
const REMOTE_TAR = '/tmp/ui_build_v2.tar';
const TARGET_DIR = '/opt/dss-edge/local-ui/build';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Force Deploy UI V2');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        console.log("Uploading TAR...");
        sftp.fastPut(LOCAL_TAR, REMOTE_TAR, (err) => {
            if (err) throw err;
            console.log("Uploaded. Executing Remote Swap...");

            // Comprehensive Command Chain
            // 1. Clean Target
            // 2. Extract
            // 3. Verify
            const cmd = `
                echo "1. PRE-CLEAN"
                ls -l ${TARGET_DIR}/index.html
                rm -rf ${TARGET_DIR}/*
                
                echo "2. EXTRACT"
                mkdir -p ${TARGET_DIR}
                tar -xf ${REMOTE_TAR} -C ${TARGET_DIR}
                
                echo "3. POST-VERIFY"
                ls -l ${TARGET_DIR}/index.html
                stat ${TARGET_DIR}/index.html
            `;

            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    console.log('Deployment Complete. Code: ' + code);
                    conn.end();
                }).on('data', (d) => process.stdout.write(d)).stderr.on('data', (d) => process.stderr.write(d));
            });
        });
    });
}).connect(config);
