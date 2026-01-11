const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- STORAGE WIPE TOOL ---');
    console.log('WARNING: This will delete ALL recordings and ALL databases.');

    const cmd = `
        echo "Stopping services..."
        pm2 stop all || true
        pkill -9 -f edgeOrchestrator.js || true
        pkill -9 -f server.js || true
        
        echo "Wiping storage..."
        rm -rf /opt/dss-edge/storage/*
        
        echo "Restarting services..."
        # Orchestrator will restart the logic
        node /opt/dss-edge/orchestrator/edgeOrchestrator.js &
        
        echo "WIPE COMPLETE"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            console.log('Remote execution finished.');
            conn.end();
            process.exit(0);
        }).on('data', d => console.log('STDOUT: ' + d))
            .stderr.on('data', d => console.error('STDERR: ' + d));
    });
}).connect(config);
