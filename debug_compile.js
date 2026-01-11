const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    const cmd = `
    cd /opt/dss-edge/recorder_cpp
    g++ -c Decoder.cpp -o Decoder.o $(pkg-config --cflags libavformat libavcodec libavutil)
    echo "Compilation step done: $?"
    nm --undefined-only Decoder.o | grep av_packet_
    `;
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('stderr', d => console.log(d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect(config);
