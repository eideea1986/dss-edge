const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connected. STARTING SERVICE...');

    // Command sequence
    const cmd = `
        systemctl start dss-edge
        pm2 start /opt/dss-edge/local-api/server.js --name dss-edge || pm2 restart dss-edge
        echo "START COMPLETE"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Server Start Triggered.', code);
            conn.end();
            process.exit(0);
        }).on('data', (data) => console.log(data.toString()));
    });
}).connect(config);
