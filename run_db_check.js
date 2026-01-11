const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();

conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        // Upload script
        sftp.fastPut('i:/dispecerat/github_release/dss-edge/db_check.js', '/tmp/db_check.js', (err) => {
            if (err) {
                console.error('Upload failed:', err);
                conn.end();
                return;
            }

            // Run it
            conn.exec('cd /opt/dss-edge && node /tmp/db_check.js', (err, stream) => {
                stream.on('data', d => console.log(d.toString()));
                stream.stderr.on('data', d => console.log('ERR:', d.toString()));
                stream.on('close', () => conn.end());
            });
        });
    });
}).connect({
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
});
