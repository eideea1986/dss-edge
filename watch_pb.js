const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- WATCHING PLAYBACK ERRORS ---');
    // Follow the logs and look for playback related errors
    const cmd = `tail -f /root/.pm2/logs/dss-edge-error.log | grep -i playback`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.on('close', () => conn.end());
    });

    // Also check the out log for "Concat Stream" messages
    setTimeout(() => {
        conn.exec('tail -n 50 /root/.pm2/logs/dss-edge-out.log | grep "[Playback]"', (err, stream) => {
            if (!err) stream.on('data', d => console.log("OUT LOG: " + d.toString()));
        });
    }, 1000);

}).connect(config);
