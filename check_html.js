const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('--- HTML CHECK ---');
    conn.exec('cat /opt/dss-edge/local-ui/build/index.html && ls -la /opt/dss-edge/local-ui/build/static/js/', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        });
    });
}).connect(config);
