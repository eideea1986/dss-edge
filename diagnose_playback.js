const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
    console.log('=== Playback Diagnostic - 10 Minute Check ===\n');

    // 1. Check segments table
    const camId = 'cam_00e5d3a3';

    conn.exec(`cd /opt/dss-edge/storage/${camId} && sqlite3 index.db "SELECT id, file, start_ts, end_ts FROM segments WHERE start_ts > 0 LIMIT 5"`, (err, stream) => {
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', () => {
            console.log('1️⃣ Segments in DB:');
            console.log(output || '(empty)');

            // 2. Check timestamp format
            conn.exec(`cd /opt/dss-edge/storage/${camId} && sqlite3 index.db "SELECT MIN(start_ts), MAX(start_ts), AVG(end_ts - start_ts) FROM segments WHERE start_ts > 0"`, (err, stream) => {
                let output2 = '';
                stream.on('data', d => output2 += d.toString());
                stream.on('close', () => {
                    console.log('\n2️⃣ Timestamp Analysis:');
                    console.log(output2);
                    const values = output2.split('|');
                    if (values[0] && values[0].length > 10) {
                        console.log('✅ Timestamps are in MILLISECONDS (correct)');
                    } else {
                        console.log('❌ Timestamps are in SECONDS (WRONG!)');
                    }

                    // 3. Check actual files
                    conn.exec(`ls -lh /opt/dss-edge/storage/${camId}/segments/ | head -n 10`, (err, stream) => {
                        let output3 = '';
                        stream.on('data', d => output3 += d.toString());
                        stream.on('close', () => {
                            console.log('\n3️⃣ Segment Files on Disk:');
                            console.log(output3);

                            // 4. Check concat file format
                            conn.exec('cat /tmp/playback_concat.txt 2>/dev/null || echo "(no concat file)"', (err, stream) => {
                                let output4 = '';
                                stream.on('data', d => output4 += d.toString());
                                stream.on('close', () => {
                                    console.log('\n4️⃣ Last Concat File:');
                                    console.log(output4);
                                    conn.end();
                                });
                            });
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
