const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.exec('ls -1 /opt/dss-edge/storage | head -n 1', (err, stream) => {
        let camBuf = '';
        stream.on('data', d => camBuf += d.toString());
        stream.on('close', () => {
            const cam = camBuf.trim();
            if (!cam) { console.log('No cameras found'); conn.end(); return; }

            const cmd = `/opt/dss-edge/recorder_cpp/build/playback_engine /opt/dss-edge/storage/${cam} 0 99999999999999 test`;
            console.log("Running:", cmd);
            conn.exec(cmd, (err2, s2) => {
                s2.on('data', d => console.log(d.toString()));
                s2.on('stderr', d => console.error(d.toString()));
                s2.on('close', (code) => {
                    console.log("Exit:", code);
                    conn.end();
                });
            });
        });
    });
}).connect(config);
