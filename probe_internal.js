const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('--- INTERNAL CURL PROBE ---');
    // Request calendar for JAN 2026
    const cmd = `curl -s "http://localhost:8080/playback/calendar-month/cam_34b5a397/2026/1"`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => console.log('RESPONSE:', d.toString())).on('close', () => conn.end());
    });
}).connect(config);
