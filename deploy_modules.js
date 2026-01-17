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

conn.on('ready', () => {
    conn.sftp(async (err, sftp) => {
        if (err) throw err;
        try {
            console.log("1. Creating Modules Directory...");
            await new Promise(r => conn.exec('mkdir -p /opt/dss-edge/modules/record', r));

            console.log("2. Uploading Recorder Wrapper...");
            const localWrap = path.join(__dirname, 'recorder_deploy/modules/record/recorder_wrapper.js');
            const remoteWrap = '/opt/dss-edge/modules/record/recorder_wrapper.js';
            await new Promise((resolve, reject) => {
                sftp.fastPut(localWrap, remoteWrap, (err) => {
                    if (err) reject(err); else resolve();
                });
            });

            console.log("3. Updating Registry...");
            const localReg = path.join(__dirname, 'recorder_deploy/core/orchestrator/serviceRegistry.js');
            const remoteReg = '/opt/dss-edge/core/orchestrator/serviceRegistry.js';
            await new Promise((resolve, reject) => {
                sftp.fastPut(localReg, remoteReg, (err) => {
                    if (err) reject(err); else resolve();
                });
            });

            console.log("✅ MODULES DEPLOYED.");
            conn.end();

        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
