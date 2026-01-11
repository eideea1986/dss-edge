const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('--- FINAL CLEANUP & WIPE ---');
    const cmd = `
        pm2 stop all || true
        # Remove storage
        rm -rf /opt/dss-edge/storage/*
        # Remove junk
        cd /opt/dss-edge && rm -v *.js *.log *.tar.gz *.zip *.whl *.jpg *.ps1 *.sh *.new *.desktop 2>/dev/null || true
        # Remove build artifacts in local-ui later if needed, but for now just root junk
        
        # Ensure fresh start
        pm2 restart all
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.on('close', () => {
            conn.end();
            console.log('CLEANUP FINISHED');
        });
    });
}).connect(config);
