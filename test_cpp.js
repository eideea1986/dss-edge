const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    const cmd = `echo '#include <iostream>\nint main() { std::cout << "Hello" << std::endl; return 0; }' > /tmp/test.cpp && g++ /tmp/test.cpp -o /tmp/test_bin && /tmp/test_bin`;
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('stderr', d => console.error(d.toString()));
        stream.on('close', (code) => {
            console.log('Exit code:', code);
            conn.end();
        });
    });
}).connect(config);
