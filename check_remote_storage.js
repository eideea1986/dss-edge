const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const camId = 'cam_34b5a397';
const conn = new Client();
conn.on('ready', () => {
    console.log(`Checking storage for ${camId}...`);

    const cmds = [
        `ls -la /opt/dss-edge/storage/${camId}`,
        `sqlite3 /opt/dss-edge/storage/${camId}/index.db "SELECT COUNT(*) FROM segments;"`,
        `sqlite3 /opt/dss-edge/storage/${camId}/index.db "SELECT * FROM segments ORDER BY start_ts DESC LIMIT 5;"`
    ];

    const runCmd = (index) => {
        if (index >= cmds.length) {
            conn.end();
            return;
        }
        console.log(`\n> ${cmds[index]}`);
        conn.exec(cmds[index], (err, stream) => {
            if (err) {
                console.error("Exec error:", err);
                conn.end();
                return;
            }
            stream.on('data', (d) => process.stdout.write(d));
            stream.on('close', () => runCmd(index + 1));
        });
    };

    runCmd(0);

}).connect(config);
