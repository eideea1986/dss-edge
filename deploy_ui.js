const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const LOCAL_TAR = 'i:/dispecerat/github_release/dss-edge/ui_build.tar';
const REMOTE_TAR = '/tmp/ui_build.tar';
const TARGET_DIR = '/opt/dss-edge/local-ui/build';

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Deploying UI Build');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        console.log("Uploading TAR...");
        sftp.fastPut(LOCAL_TAR, REMOTE_TAR, (err) => {
            if (err) throw err;
            console.log("Uploaded. Extracting...");

            const cmd = `rm -rf ${TARGET_DIR} && mkdir -p ${TARGET_DIR} && tar -xf ${REMOTE_TAR} -C ${TARGET_DIR} && rm ${REMOTE_TAR}`;

            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    console.log('UI Deployed Successfully. Code: ' + code);
                    conn.end();
                }).on('data', (d) => process.stdout.write(d)).stderr.on('data', (d) => process.stderr.write(d));
            });
        });
    });
}).connect(config);
