const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    // Explicit include path usually /usr/include or /usr/include/x86_64-linux-gnu
    const cmd = `cd /opt/dss-edge/recorder_cpp && g++ -c Decoder.cpp -o Decoder.o -I/usr/include/x86_64-linux-gnu -I/usr/include`;

    console.log("Running compilation check...");
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log('STDOUT:', d.toString()));
        stream.on('stderr', d => console.log('STDERR:', d.toString()));
        stream.on('close', (code) => {
            console.log(`Exit code: ${code}`);
            if (code === 0) {
                conn.exec('nm -C Decoder.o | grep av_packet', (e2, s2) => {
                    s2.on('data', d => console.log('SYMBOLS:', d.toString()));
                    s2.on('close', () => conn.end());
                });
            } else {
                conn.end();
            }
        });
    });
}).connect(config);
