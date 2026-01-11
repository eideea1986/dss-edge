const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    const cmd = `cd /opt/dss-edge/recorder_cpp && g++ main.cpp Decoder.cpp Segmenter.cpp WriterPool.cpp IndexDB.cpp AiDB.cpp -o recorder -lavformat -lavcodec -lavutil -lswscale -lsqlite3 -lpthread`;
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('stderr', d => console.error(d.toString()));
        stream.on('close', (code) => {
            console.log('Exit code:', code);
            conn.end();
        });
    });
}).connect(config);
