const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const commands = [
    // 1. STOP EVERYTHING
    'pm2 stop all',
    'pm2 delete all', // Clear PM2 state to avoid resurrecting ghosts
    'pkill -9 -f node', // Force kill ALL node processes
    'pkill -9 -f ffmpeg', // Force kill ALL ffmpeg processes
    'pkill -9 -f dss-edge',

    // 2. CLEANUP TEMP FILES
    'rm -rf /tmp/ai_raw_*',
    'rm -rf /opt/dss-edge/recorder/ramdisk/snapshots/*',

    // 3. VERIFY & RESTART
    'echo "Systems Purged. Restarting..."',
    'cd /opt/dss-edge',
    // Assuming ecosystem.config.js checks out, we use it. If not, we use basic start.
    'pm2 start local-api/server.js --name dss-edge-api',
    'pm2 start orchestrator/edgeOrchestrator.js --name dss-edge-orch',
    'pm2 save'
];

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Initiating Deep Clean Protocol');

    // Chain commands
    const fullCmd = commands.join(' && ');

    conn.exec(fullCmd, (err, stream) => {
        if (err) {
            console.error("Exec Error:", err);
            return;
        }
        stream.on('data', (d) => process.stdout.write(d));
        stream.on('close', (code) => {
            console.log(`\nClean & Restart script finished with code ${code}`);
            conn.end();
        });
    });
}).connect(config);
