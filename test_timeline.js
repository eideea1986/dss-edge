const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    // 1. Get Server Date
    conn.exec('date', (err, stream) => {
        stream.on('data', d => {
            const serverDate = d.toString().trim();
            console.log('Server Date:', serverDate);

            // Extract YYYY-MM-DD from server (assuming format is sensible or default)
            // Or just hardcode today for this check
            const today = new Date().toISOString().split('T')[0];
            const url = `http://localhost:8080/api/playback/timeline-day/cam_34b5a397/${today}`;

            console.log(`Checking URL: ${url}`);

            conn.exec(`curl -s "${url}"`, (e2, s2) => {
                let json = '';
                s2.on('data', d => json += d);
                s2.on('close', () => {
                    try {
                        const res = JSON.parse(json);
                        console.log('Response Count:', res.count);
                        if (res.segments && res.segments.length > 0) {
                            console.log('First Segment:', res.segments[0]);
                            console.log('Last Segment:', res.segments[res.segments.length - 1]);
                        } else {
                            console.log('NO SEGMENTS!');
                        }
                    } catch (e) {
                        console.log('Invalid JSON:', json.substring(0, 100));
                    }
                    conn.end();
                });
            });
        });
    });
}).connect({ host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' });
