const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
    console.log('=== Testing Supervisor ===\n');

    // 1. Enable and start supervisor
    conn.exec('systemctl enable dss-supervisor && systemctl start dss-supervisor', (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.stderr.on('data', d => console.log('ERR:', d.toString()));
        stream.on('close', () => {

            // 2. Check status after 3 seconds
            setTimeout(() => {
                conn.exec('systemctl status dss-supervisor', (err, stream) => {
                    stream.on('data', d => console.log('\n=== Service Status ===\n' + d.toString()));
                    stream.on('close', () => {

                        // 3. Check logs
                        conn.exec('tail -n 20 /var/log/dss-supervisor.log', (err, stream) => {
                            stream.on('data', d => console.log('\n=== Supervisor Logs ===\n' + d.toString()));
                            stream.on('close', () => {

                                // 4. Check heartbeat file
                                conn.exec('ls -lh /tmp/dss-recorder.hb', (err, stream) => {
                                    stream.on('data', d => console.log('\n=== Heartbeat File ===\n' + d.toString()));
                                    stream.on('close', () => conn.end());
                                });
                            });
                        });
                    });
                });
            }, 3000);
        });
    });
}).connect({
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
});
