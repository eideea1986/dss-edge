const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};
const conn = new Client();

conn.on('ready', () => {
    console.log('--- SERVER TIME DIAGNOSTIC ---');
    const cmd = `
        echo ">>> DATE:"
        date
        
        echo "\n>>> TIMEDATECTL:"
        timedatectl
        
        echo "\n>>> MAX DB TIMESTAMP (cam_34b5a397):"
        sqlite3 /opt/dss-edge/storage/cam_34b5a397/index.db 'SELECT max(start_ts) FROM segments'
        
        echo "\n>>> CHECKING SAMPLE FUTURE SEGMENT:"
        # Verificam daca exista segmente mai mari decat acum
        sqlite3 /opt/dss-edge/storage/cam_34b5a397/index.db "SELECT start_ts FROM segments WHERE start_ts > $(date +%s)000 LIMIT 1"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => conn.end()).on('data', d => console.log(d.toString()));
    });
}).connect(config);
