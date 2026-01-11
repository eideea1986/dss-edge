const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    const cmd = `cd /opt/dss-edge/recorder_cpp/build && /usr/bin/c++ CMakeFiles/recorder.dir/main.cpp.o CMakeFiles/recorder.dir/Decoder.cpp.o CMakeFiles/recorder.dir/Segmenter.cpp.o CMakeFiles/recorder.dir/WriterPool.cpp.o CMakeFiles/recorder.dir/IndexDB.cpp.o CMakeFiles/recorder.dir/AiDB.cpp.o -o recorder -lavformat -lavcodec -lavutil -lswscale -lsqlite3 -lpthread -Wl,--verbose`;
    conn.exec(cmd, (err, stream) => {
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.on('stderr', d => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
            console.log('\nExit code:', code);
            conn.end();
        });
    });
}).connect(config);
