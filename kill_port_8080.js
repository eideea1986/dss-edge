const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Killing Port 8080 Owner');

    // Find PID listening on 8080
    const cmd = "netstat -nlp | grep :8080 | awk '{print $7}' | awk -F'/' '{print $1}'";

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let pid = '';
        stream.on('data', (d) => { pid += d.toString().trim(); });
        stream.on('close', () => {
            console.log(`Found PID on 8080: ${pid}`);
            if (pid && pid.length > 0) {
                conn.exec(`kill -9 ${pid}`, (err2, stream2) => {
                    stream2.on('close', () => {
                        console.log(`Killed PID ${pid}. Port 8080 should be free.`);
                        conn.end();
                    });
                });
            } else {
                console.log("No PID found on 8080. Maybe free?");
                conn.end();
            }
        });
    });
}).connect(config);
