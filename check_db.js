const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('--- DB & DATE CHECK ---');
    const cmd = `
        echo "SERVER DATE:"
        date
        echo "MAX TIMESTAMP IN DB (cam_34b5a397):"
        sqlite3 /opt/dss-edge/storage/cam_34b5a397/index.db 'SELECT max(start_ts) FROM segments'
        echo "SAMPLE FUTURE TIMESTAMP:"
        sqlite3 /opt/dss-edge/storage/cam_34b5a397/index.db 'SELECT start_ts FROM segments WHERE start_ts > 1768176000000 LIMIT 5'
    `;
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => conn.end()).on('data', d => console.log(d.toString()));
    });
}).connect(config);
