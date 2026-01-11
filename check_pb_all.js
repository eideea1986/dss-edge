const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- CHECKING ALL PB LOGS ---');
    const cmd = `tail -n 1000 /root/.pm2/logs/dss-edge-out.log | grep -i "playback"`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            conn.end();
            process.exit(0);
        }).on('data', d => console.log('STDOUT: ' + d))
            .stderr.on('data', d => console.error('STDERR: ' + d));
    });
}).connect(config);
