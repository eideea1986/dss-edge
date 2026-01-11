const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- CHECKING DB ---');
    // Check first 5 and last 5 segments
    const cmd = `sqlite3 /opt/dss-edge/storage/cam_ccb3aba7/index.db "SELECT id, start_ts, (end_ts - start_ts) as dur FROM segments ORDER BY id ASC LIMIT 5; SELECT '---'; SELECT id, start_ts, (end_ts - start_ts) as dur FROM segments ORDER BY id DESC LIMIT 5;"`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => console.log(d.toString()));
        stream.on('close', () => {
            conn.end();
            process.exit(0);
        });
    });
}).connect(config);
