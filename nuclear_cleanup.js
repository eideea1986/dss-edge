const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
console.log("=== NUCLEAR CLEANUP ===");

conn.on('ready', () => {
    const cmd = `
        systemctl stop dss-edge
        killall node
        sleep 2
        killall -9 node
        systemctl start dss-edge
        sleep 5
        /opt/dss-edge/update_camera_status.sh
        sleep 2
        curl -s http://127.0.0.1:8080/reload-status
        echo "CLEANUP DONE."
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.pipe(process.stdout);
        stream.on('close', () => conn.end());
    });
}).on('error', (err) => {
    console.error("Conn Error:", err);
}).connect(config);
