const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- PATCHING AND RECOMPILING RECORDER ---');

    const cmd = `
        cd /opt/dss-edge/recorder_cpp
        
        # 1. Update Decoder.cpp (2s -> 60s)
        sed -i 's/SEGMENT_DURATION_SECONDS = 2/SEGMENT_DURATION_SECONDS = 60/g' Decoder.cpp
        
        # 2. Update Segmenter.cpp (Unique filenames)
        cat <<EOF > Segmenter.cpp
#include <string>
#include <filesystem>
#include <atomic>
#include <iostream>
#include <ctime>

static std::atomic<int> segmentId{0};

std::string nextSegmentPath(const std::string& base) {
    if (!std::filesystem::exists(base + "/segments")) {
        std::filesystem::create_directories(base + "/segments");
    }
    char buf[128];
    // Use timestamp + counter for uniqueness even on restarts
    sprintf(buf, "seg_%ld_%04d.ts", (long)std::time(nullptr), (segmentId.load() % 10000));
    segmentId++;
    return base + "/segments/" + buf;
}
EOF

        # 3. Recompile
        cd build
        make -j$(nproc)
        
        # 4. Restart DSS-Edge to apply new binary
        pm2 restart dss-edge
        
        echo "PATCHING COMPLETE"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => console.log(d.toString()));
        stream.stderr.on('data', d => console.error(d.toString()));
        stream.on('close', () => {
            console.log('Remote execution finished.');
            conn.end();
        });
    });
}).connect(config);
