const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    console.log("Starting deletion...");
    const cmd = "rm -rf /opt/dss-edge/recorder";
    conn.exec(cmd, (err, stream) => {
        stream.on('close', (code) => {
            console.log(`Deletion finished with code ${code}`);
            conn.exec('df -h /', (e2, s2) => {
                s2.on('data', d => console.log(d.toString()));
                s2.on('close', () => conn.end());
            });
        });
        stream.on('stderr', d => console.log('ERR:', d.toString()));
    });
}).connect(config);
