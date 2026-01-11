const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- SEARCHING Segment Rotation in Decoder.cpp ---');
    const cmd = `grep -C 5 "Segment rotation" /opt/dss-edge/recorder_cpp/Decoder.cpp`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => console.log(d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect(config);
