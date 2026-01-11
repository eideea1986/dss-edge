const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    conn.exec('ls -1 /opt/dss-edge/storage', (err, stream) => {
        let cams = '';
        stream.on('data', d => cams += d.toString());
        stream.on('close', () => {
            const list = cams.trim().split('\n').filter(Boolean);
            let checked = 0;
            if (list.length === 0) { console.log("No cams"); conn.end(); return; }

            list.forEach(cam => {
                const cmd = `sqlite3 /opt/dss-edge/storage/${cam}/index.db "SELECT count(*) FROM segments;"`;
                conn.exec(cmd, (e2, s2) => {
                    s2.on('data', d => {
                        const count = parseInt(d.toString().trim());
                        if (count > 0) console.log(`${cam}: ${count} segments`);
                    });
                    s2.on('close', () => {
                        checked++;
                        if (checked === list.length) {
                            console.log('Done checking.');
                            conn.end();
                        }
                    });
                });
            });
        });
    });
}).connect(config);
