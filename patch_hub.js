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
const remoteHubPath = '/opt/dss-hub';

const filesToPatch = [
    {
        local: path.join(localHubPath, 'hub-api/server.js'),
        remote: path.join(remoteHubPath, 'hub-api/server.js')
    },
    // The UI is built, we need to upload the build... 
    // BUT patching individual UI source files works IF the user rebuilds on the server.
    // Assuming we need to build locally and upload 'build' folder OR upload source and build there.
    // Let's assume standard practice is uploading the built UI assets to /opt/dss-hub/hub-ui/dist or build.
    // The previous deployment structure isn't 100% clear. 
    // Let's try to upload the source and trigger a rebuild on the server if possible, 
    // OR just upload the Dashboard.js if they run a dev server (unlikely provided port 80).
    // Let's assume production build.

    // STRATEGY: Build UI locally, then upload the build artifact.
    // We will do that in the terminal.
];

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Connected to HUB (205). Patching API...');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        let pending = filesToPatch.length;
        filesToPatch.forEach(file => {
            sftp.fastPut(file.local, file.remote, (err) => {
                if (err) console.error(`Error uploading ${file.local}:`, err);
                else console.log(`Up: ${file.local} -> ${file.remote}`);
                pending--;
                if (pending === 0) {
                    console.log('✅ HUB API PATCH SUCCESSFUL');
                    conn.end();
                }
            });
        });
    });
}).connect(config);
