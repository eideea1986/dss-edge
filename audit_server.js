const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('--- SERVER AUDIT START ---');

    const cmd = `
        echo ">>> PROCESS ON PORT 8080:"
        fuser -v -n tcp 8080
        netstat -tulpn | grep 8080
        
        echo "\n>>> PM2 STATUS:"
        pm2 list
        
        echo "\n>>> NODE PROCESS ARGS (PID):"
        # Find PID of node running server.js
        pgrep -a node
        
        echo "\n>>> UI BUILD FOLDER STATS:"
        ls -la --full-time /opt/dss-edge/local-ui/build/ | head -n 10
        ls -la --full-time /opt/dss-edge/local-ui/build/index.html
        
        echo "\n>>> CHECKING FOR NGINX:"
        systemctl status nginx --no-pager || echo "Nginx not running"
        
        echo "\n>>> CURRENT DATE ON SERVER:"
        date
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('\n--- AUDIT COMPLETE ---');
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect(config);
