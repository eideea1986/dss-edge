const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connected. STOPPING SERVICE & WIPING UI...');

    // Command sequence
    const cmd = `
        systemctl stop dss-edge || true
        pm2 stop dss-edge || true
        pm2 delete dss-edge || true
        pkill -9 -f edgeOrchestrator.js || true
        pkill -9 -f server.js || true
        fuser -k 8080/tcp || true
        fuser -k 8081/tcp || true
        fuser -k 8090/tcp || true
        rm -rf /opt/dss-edge/local-ui/build

        echo "CLEANUP COMPLETE"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Server Stopped & UI Wiped. Code:', code);
            conn.end();
            process.exit(0);
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect(config);
