const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
    console.log('=== Testing Playback Backend ===\n');

    // 1. Test timeline API
    conn.exec('curl -s "http://localhost:8080/api/playback/timeline/cam_34b5a397?from=1736550000000&to=1736636400000"', (err, stream) => {
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', () => {
            console.log('1️⃣ Timeline API Response:');
            console.log(output.substring(0, 500));
            console.log('');

            // 2. Check if segments exist in DB
            conn.exec('cd /opt/dss-edge/local-api && NODE_PATH=./node_modules node -e "const sqlite3 = require(\'sqlite3\'); const db = new sqlite3.Database(\'/opt/dss-edge/storage/cam_34b5a397/index.db\', sqlite3.OPEN_READONLY); db.all(\'SELECT COUNT(*) as count FROM segments\', (err, rows) => { console.log(\'Segments count:\', rows[0].count); db.close(); });"', (err, stream) => {
                let output2 = '';
                stream.on('data', d => output2 += d.toString());
                stream.on('close', () => {
                    console.log('2️⃣ DB Segments:');
                    console.log(output2);

                    // 3. Check playback start endpoint
                    conn.exec('curl -X POST -H "Content-Type: application/json" -d \'{"camId":"cam_34b5a397","from":1736550000000,"to":1736636400000,"speed":1}\' http://localhost:8080/api/playback/start', (err, stream) => {
                        let output3 = '';
                        stream.on('data', d => output3 += d.toString());
                        stream.stderr.on('data', d => output3 += 'ERR: ' + d.toString());
                        stream.on('close', () => {
                            console.log('\n3️⃣ Playback Start Response:');
                            console.log(output3);
                            conn.end();
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
