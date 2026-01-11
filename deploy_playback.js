const { Client } = require('ssh2');
const fs = require('fs');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const files = [
            { local: 'i:/dispecerat/github_release/dss-edge/local-api/routes/playback.js', remote: '/opt/dss-edge/local-api/routes/playback.js' },
            { local: 'i:/dispecerat/github_release/dss-edge/local-api/server.js', remote: '/opt/dss-edge/local-api/server.js' }
        ];

        let done = 0;
        files.forEach(f => {
            sftp.fastPut(f.local, f.remote, (err) => {
                if (err) console.error('Upload error:', err);
                else console.log(`Uploaded ${f.remote}`);

                done++;
                if (done === files.length) {
                    console.log('Restarting dss-edge...');
                    conn.exec('systemctl restart dss-edge', () => conn.end());
                }
            });
        });
    });
}).connect(config);
