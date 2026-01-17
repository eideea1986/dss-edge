const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Connected');
    const targetTs = 1768153997579;
    const remoteCmd = `sqlite3 /opt/dss-edge/storage/cam_34b5a397/index.db "SELECT start_ts, end_ts, file FROM segments WHERE start_ts <= ${targetTs} ORDER BY start_ts DESC LIMIT 1;"`;
    conn.exec(remoteCmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', (data) => {
            console.log('MATCH:', data.toString());
        }).on('close', () => {
            conn.end();
        });
    });
}).connect(config);
