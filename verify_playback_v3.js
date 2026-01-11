const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    const basePath = '/opt/dss-edge/recorder/cam_clean_test';
    // Use a go2rtc stream that we know works or direct cam
    const rtsp = 'rtsp://127.0.0.1:8554/cam_00e5d3a3';

    console.log('Cleaning...');
    conn.exec(`rm -rf ${basePath} && mkdir -p ${basePath}`, (err, stream) => {
        stream.on('close', () => {
            console.log('Starting Recorder...');
            const cmd = `/opt/dss-edge/recorder_cpp/build/recorder "${rtsp}" "${basePath}"`;
            conn.exec(cmd, (err2, s2) => {
                s2.on('data', d => console.log('REC:', d.toString().trim()));
                s2.on('stderr', d => console.error('REC ERR:', d.toString().trim()));

                setTimeout(() => {
                    console.log('Stopping and checking DB...');
                    conn.exec('killall -9 recorder', () => {
                        conn.exec(`sqlite3 ${basePath}/index.db "SELECT * FROM segments;"`, (e3, s3) => {
                            s3.on('data', d => console.log('DB SEGMENTS:', d.toString()));
                            s3.on('stderr', d => console.error('DB ERR:', d.toString()));
                            s3.on('close', () => conn.end());
                        });
                    });
                }, 15000); // 15s recording
            });
        });
    });
}).connect(config);
