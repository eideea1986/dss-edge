const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- SYSTEM CHECK ---');
    const cmd = `
        mkdir -p /opt/dss-edge/tmp
        echo "Server Date: $(date)"
        echo "Server Unix: $(date +%s%3N)"
        ls -l /opt/dss-edge/storage/cam_ccb3aba7/index.db
        sqlite3 /opt/dss-edge/storage/cam_ccb3aba7/index.db "SELECT count(*) FROM segments;"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', () => {
            conn.end();
        });
    });
}).connect(config);
