const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- DUMPING SEGMENT INFO ---');
    const cmd = `
        sqlite3 /opt/dss-edge/storage/cam_11b94237/index.db "SELECT start_ts, end_ts, file FROM segments ORDER BY start_ts DESC LIMIT 5;"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            conn.end();
            process.exit(0);
        }).on('data', d => console.log('STDOUT: ' + d))
            .stderr.on('data', d => console.error('STDERR: ' + d));
    });
}).connect(config);
