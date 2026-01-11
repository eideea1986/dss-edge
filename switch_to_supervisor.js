const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
    console.log('=== Switching to Supervisor Architecture ===\n');

    // 1. Stop old dss-edge service
    console.log('1. Stopping old dss-edge service...');
    conn.exec('systemctl stop dss-edge && systemctl disable dss-edge', (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('close', () => {

            // 2. Kill any remaining node processes
            console.log('\n2. Cleaning up old processes...');
            conn.exec('killall -9 node 2>/dev/null; sleep 2', (err, stream) => {
                stream.on('close', () => {

                    // 3. Restart supervisor (fresh start)
                    console.log('\n3. Restarting supervisor...');
                    conn.exec('systemctl restart dss-supervisor', (err, stream) => {
                        stream.on('close', () => {

                            // 4. Wait and check status
                            setTimeout(() => {
                                conn.exec('systemctl status dss-supervisor | head -n 20', (err, stream) => {
                                    stream.on('data', d => console.log('\n=== Supervisor Status ===\n' + d.toString()));
                                    stream.on('close', () => {

                                        // 5. Check processes
                                        conn.exec('ps aux | grep -E "(supervisor|orchestrator)" | grep -v grep', (err, stream) => {
                                            stream.on('data', d => console.log('\n=== Running Processes ===\n' + d.toString()));
                                            stream.on('close', () => conn.end());
                                        });
                                    });
                                });
                            }, 5000);
                        });
                    });
                });
            });
        });
    });
}).connect({
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
});
