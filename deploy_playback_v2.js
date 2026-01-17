const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const FILES = [
    { local: 'i:/dispecerat/github_release/dss-edge/local-api/playback/playbackStats.js', remote: '/opt/dss-edge/local-api/playback/playbackStats.js' },
    { local: 'i:/dispecerat/github_release/dss-edge/local-api/playback/playbackController.js', remote: '/opt/dss-edge/local-api/playback/playbackController.js' }
];

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Deploying Playback Fixes 2');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        let pending = FILES.length;
        const checkDone = () => {
            pending--;
            if (pending === 0) {
                console.log("Files uploaded. Restarting API...");
                conn.exec('pm2 restart dss-edge-api', (err, stream) => {
                    stream.on('close', () => {
                        console.log("API Restarted.");
                        conn.end();
                    });
                });
            }
        };

        FILES.forEach(f => {
            sftp.fastPut(f.local, f.remote, (err) => {
                if (err) console.error("Upload failed for " + f.remote, err);
                else console.log("Uploaded " + f.remote);
                checkDone();
            });
        });
    });
}).connect(config);
