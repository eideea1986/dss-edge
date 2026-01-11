const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready');
    const basePath = '/opt/dss-edge/recorder/cam_pb_test';
    const rtsp = 'rtsp://127.0.0.1:8554/cam_e4a9af3b'; // Use simple name if sub unavailable

    conn.exec(`rm -rf ${basePath} && mkdir -p ${basePath}/segments`, (err, stream) => {
        stream.on('close', () => {
            console.log('Dir prepared');
            const cmd = `/opt/dss-edge/recorder_cpp/build/recorder "${rtsp}" "${basePath}"`;
            console.log('Running Recorder:', cmd);
            conn.exec(cmd, (err3, s3) => {
                s3.on('data', d => process.stdout.write('[REC] ' + d.toString()));
                s3.on('stderr', d => process.stderr.write('[REC ERR] ' + d.toString()));
            });

            setTimeout(() => {
                console.log('Stopping Recorder...');
                conn.exec('pkill -f "recorder .*cam_pb_test"', (err4, s4) => {
                    s4.on('close', () => {
                        console.log('Running Playback Engine...');
                        const pbCmd = `/opt/dss-edge/recorder_cpp/build/playback_engine ${basePath} 0 99999999999999 test`;
                        conn.exec(pbCmd, (err5, s5) => {
                            s5.on('data', d => console.log('[PB]', d.toString()));
                            s5.on('stderr', d => console.error('[PB ERR]', d.toString()));
                            s5.on('close', () => conn.end());
                        });
                    });
                });
            }, 10000);
        });
    });
}).connect(config);
