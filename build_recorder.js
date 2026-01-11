const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    console.log('Building...');
    conn.exec('cd /opt/dss-edge/recorder_cpp/build && make', (err, stream) => {
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.on('stderr', d => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
            console.log('\nExit code:', code);
            conn.end();
        });
    });
}).connect(config);
