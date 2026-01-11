const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('--- CHECK REMOTE FILE CONTENT ---');
    // Check for the "LTE NOW" comment or logic in playback.js
    conn.exec('grep "LTE NOW" /opt/dss-edge/local-api/routes/playback.js', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Grep Code (0=Found, 1=NotFound):', code);
            conn.end();
        }).on('data', (data) => {
            console.log('MATCH FOUND:\n' + data.toString());
        });
    });
}).connect(config);
