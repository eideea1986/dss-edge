const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    // 1. KILL PORTS
    const PORTS = [8080, 8081, 8090];

    console.log('--- KILLING ZOMBIES ---');

    const fuserCommands = PORTS.map(port => `
        echo "Processes on ${port}:"
        fuser -k -v -n tcp ${port}
    `).join('');

    const cmd = `
        ${fuserCommands}
        echo "Stopping PM2..."
        pm2 stop all
        pm2 delete all
        
        echo "Global Kill Node..."
        killall -9 node
        
        echo "Starting Fresh..."
        pm2 start /opt/dss-edge/local-api/server.js --name dss-edge
        pm2 save
    `;
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            console.log('Resurrection Complete.');
            conn.end();
        }).on('data', d => console.log(d.toString()));
    });
}).connect(config);
