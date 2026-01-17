const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) throw err;

        // Upload script
        sftp.fastPut('i:/dispecerat/github_release/dss-edge/remote_reindex.js', '/tmp/remote_reindex.js', (err) => {
            if (err) throw err;
            console.log('Script uploaded to /tmp/remote_reindex.js');

            // Execute
            conn.exec('node /tmp/remote_reindex.js', (err, stream) => {
                if (err) throw err;
                stream.on('data', (d) => process.stdout.write(d));
                stream.on('close', () => {
                    console.log('Execution finished.');
                    conn.end();
                });
            });
        });
    });
}).connect(config);
