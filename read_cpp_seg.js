const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- READING Segmenter.cpp ---');
    const cmd = `cat /opt/dss-edge/recorder_cpp/Segmenter.cpp`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let buf = '';
        stream.on('data', d => buf += d.toString());
        stream.on('close', () => {
            console.log(buf);
            conn.end();
        });
    });
}).connect(config);
