const { Client } = require('ssh2');
const config = { host: '192.168.120.208', username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.exec('pm2 logs dss-edge --lines 30 --nostream', (err, stream) => {
        if (err) throw err;
        stream.on('data', d => console.log(d.toString())).on('close', () => conn.end());
    });
}).connect(config);
