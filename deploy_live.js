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
            console.log("1. Creating Live Directory...");
            await new Promise(resolve => {
                conn.exec('mkdir -p /opt/dss-edge/modules/live', (err, stream) => {
                    if (err) resolve();
                    else stream.on('close', resolve);
                });
            });

            console.log("2. Uploading Live Core...");
            const localFile = path.join(__dirname, 'recorder_deploy/modules/live/live_core.js');
            const remoteFile = '/opt/dss-edge/modules/live/live_core.js';
            await new Promise((resolve, reject) => {
                sftp.fastPut(localFile, remoteFile, (err) => {
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

            console.log("4. Disabling old go2rtc service...");
            await new Promise(resolve => {
                conn.exec('systemctl stop dss-go2rtc && systemctl disable dss-go2rtc', (err, stream) => {
                    if (err) resolve();
                    else stream.on('close', resolve);
                });
            });

            console.log("✅ LIVE CORE DEPLOYED.");
            conn.end();

        } catch (e) {
            console.error(e);
            conn.end();
        }
    });
}).connect(config);
