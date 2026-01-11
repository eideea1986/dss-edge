const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
    const cmd = 'sqlite3 /opt/dss-edge/storage/cam_34b5a397/index.db "SELECT id, file, start_ts, end_ts FROM segments LIMIT 3"';

    conn.exec(cmd, (err, stream) => {
        let output = '';
        let errOutput = '';

        stream.on('data', d => output += d.toString());
        stream.stderr.on('data', d => errOutput += d.toString());
        stream.on('close', () => {
            if (errOutput) console.log('Error:', errOutput);
            console.log('Output:', output.trim() || '(empty)');
            conn.end();
        });
    });
}).connect({
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
});
