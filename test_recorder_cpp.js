const { Client } = require('ssh2');
const config = { host: '192.168.120.208', port: 22, username: 'root', password: 'TeamS_2k25!' };
const conn = new Client();
conn.on('ready', () => {
    const basePath = '/opt/dss-edge/recorder/cam_test_working';
    // Try a different camera that might be online
    const rtsp = 'rtsp://127.0.0.1:8554/cam_e4a9af3b_hd';

    conn.exec(`mkdir -p ${basePath}/segments`, (err, stream) => {
        const cmd = `/opt/dss-edge/recorder_cpp/build/recorder "${rtsp}" "${basePath}"`;
        console.log('Running:', cmd);
        const proc = conn.exec(cmd, (err2, s2) => {
            s2.on('data', d => process.stdout.write(d.toString()));
            s2.on('stderr', d => process.stderr.write(d.toString()));
            s2.on('close', (code) => {
                console.log('Recorder exited with code:', code);
            });
        });

        setTimeout(() => {
            conn.exec('pkill recorder', () => {
                console.log('\nStopped recorder test.');
                conn.exec(`ls -R ${basePath}`, (err3, s3) => {
                    s3.on('data', d => console.log('FILES:', d.toString()));
                    s3.on('close', () => conn.end());
                });
            });
        }, 15000); // 15s
    });
}).connect(config);
