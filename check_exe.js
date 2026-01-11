const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.exec('ls -lh /opt/dss-edge/recorder_cpp/build/recorder', (err, stream) => {
        stream.on('data', d => console.log('STDOUT:', d.toString()));
        stream.on('stderr', d => console.log('STDERR:', d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect(config);
