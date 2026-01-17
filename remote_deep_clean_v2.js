const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Robust Deep Clean');

    // Commands executed one by one to ignore failures (e.g. "no process found")
    const steps = [
        'pm2 stop all || true',
        'pm2 delete all || true',
        'pkill -9 -f node || true',
        'pkill -9 -f ffmpeg || true',
        'rm -rf /tmp/ai_raw_* || true',
        'echo "--- STARTING FRESH ---"',
        'cd /opt/dss-edge && pm2 start local-api/server.js --name dss-edge-api',
        'cd /opt/dss-edge && pm2 start orchestrator/edgeOrchestrator.js --name dss-edge-orch',
        'pm2 save',
        'pm2 list' // Show verification
    ];

    executeSteps(conn, steps, 0);
}).connect(config);

function executeSteps(conn, steps, index) {
    if (index >= steps.length) {
        console.log("All steps completed.");
        conn.end();
        return;
    }

    const cmd = steps[index];
    console.log(`Executing: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
        if (err) {
            console.error(`Error exec: ${cmd}`, err);
            // Try next anyway?
            executeSteps(conn, steps, index + 1);
            return;
        }
        stream.on('data', (d) => process.stdout.write(d));
        stream.on('close', () => {
            executeSteps(conn, steps, index + 1);
        });
    });
}
