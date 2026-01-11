const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        // Create playback directory first
        conn.exec('mkdir -p /opt/dss-edge/local-api/playback', (err) => {
            if (err) console.log('mkdir error (may already exist):', err.message);

            const files = [
                { local: 'i:/dispecerat/github_release/dss-edge/local-api/playback/playbackController.js', remote: '/opt/dss-edge/local-api/playback/playbackController.js' },
                { local: 'i:/dispecerat/github_release/dss-edge/local-api/routes/playback.js', remote: '/opt/dss-edge/local-api/routes/playback.js' }
            ];

            let done = 0;
            files.forEach(f => {
                sftp.fastPut(f.local, f.remote, (err) => {
                    if (err) console.error('Upload error:', err);
                    else console.log(`Uploaded ${path.basename(f.remote)}`);

                    done++;
                    if (done === files.length) {
                        console.log('Restarting dss-edge...');
                        conn.exec('systemctl restart dss-edge', () => {
                            console.log('Done!');
                            conn.end();
                        });
                    }
                });
            });
        });
    });
}).connect(config);
