const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
const localDir = path.join(__dirname, 'recorder');
const remoteDir = '/opt/dss-edge/recorder_cpp';

conn.on('ready', () => {
    console.log('SSH connection established');
    conn.exec(`mkdir -p ${remoteDir}`, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            console.log('Remote directory created');
            uploadFiles();
        });
        stream.on('data', d => console.log('STDOUT:', d.toString()));
        stream.on('stderr', d => console.error('STDERR:', d.toString()));
    });
});

async function uploadFiles() {
    const files = [
        'CMakeLists.txt',
        'RingBuffer.hpp',
        'Decoder.cpp',
        'Segmenter.cpp',
        'WriterPool.cpp',
        'IndexDB.cpp',
        'AiDB.cpp',
        'main.cpp',
        'PlaybackEngine.cpp'
    ];

    conn.sftp((err, sftp) => {
        if (err) throw err;
        let completed = 0;
        files.forEach(file => {
            const local = path.join(localDir, file);
            const remote = remoteDir + '/' + file;
            console.log(`Uploading ${local} to ${remote}...`);
            sftp.fastPut(local, remote, (err) => {
                if (err) {
                    console.error(`Failed to upload ${file}:`, err);
                    completed++;
                } else {
                    console.log(`Uploaded ${file}`);
                    completed++;
                }
                if (completed === files.length) {
                    compile();
                }
            });
        });
    });
}

function compile() {
    console.log('Starting compilation...');
    const cmd = `cd ${remoteDir} && rm -rf build && mkdir build && cd build && cmake .. && make -j$(nproc)`;
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.on('stderr', d => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
            console.log(`\nCompilation completed with code ${code}.`);
            conn.end();
        });
    });
}

conn.on('error', err => console.error('CONN ERROR:', err));

conn.connect(config);
