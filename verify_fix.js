const { Client } = require('ssh2');
const conn = new Client();

setTimeout(() => {
    conn.on('ready', () => {
        console.log('=== Checking New Segments (after fix) ===\n');

        // 1. Check recorder logs for rotation messages
        conn.exec('journalctl -u dss-supervisor --since "1 minute ago" | grep -E "(rotation|Segment|IndexDB)" | tail -n 20', (err, stream) => {
            let output = '';
            stream.on('data', d => output += d.toString());
            stream.on('close', () => {
                console.log('1️⃣ Recent Rotation Logs:');
                console.log(output || '(no rotation logs yet)');

                // 2. Check newest segments in DB
                conn.exec('cd /opt/dss-edge/local-api && NODE_PATH=./node_modules node /tmp/db_check.js', (err, stream) => {
                    let output2 = '';
                    stream.on('data', d => output2 += d.toString());
                    stream.stderr.on('data', d => { }); // Ignore date parse errors
                    stream.on('close', () => {
                        console.log('\n2️⃣ Latest Segments in DB:');
                        console.log(output2);
                        conn.end();
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
}, 30000);

console.log('Waiting 30 seconds for new segments to be created...');
