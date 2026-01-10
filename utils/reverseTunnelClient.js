const { Client } = require('ssh2');
const fs = require('fs');
const util = require('util');
const logFile = fs.createWriteStream('/tmp/tunnel_debug.log', { flags: 'a' });
const logStdout = process.stdout;

console.log = function (d) {
    logFile.write(util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
};
console.error = function (d) {
    logFile.write(util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
};
const path = require('path');
const net = require('net');

// Load Config
let tunnelConfig = { enabled: false, dispatchHost: "", dispatchApiPort: 0, dispatchVideoPort: 0 };
try {
    const p = path.join(__dirname, '../config/tunnel.json');
    if (fs.existsSync(p)) {
        tunnelConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
} catch (e) {
    console.error(`[ReverseTunnel] Config load error: ${e.message}`);
}

if (!tunnelConfig.enabled || !tunnelConfig.dispatchHost) {
    console.log("[ReverseTunnel] Disabled or missing host.");
    setInterval(() => { }, 60000); // Keep alive
    return;
}

const TUNNELS = [];
// API Tunnel
if (tunnelConfig.dispatchApiPort) {
    TUNNELS.push({
        name: "API",
        remotePort: parseInt(tunnelConfig.dispatchApiPort),
        localHost: "127.0.0.1",
        localPort: 8080
    });
}
// Video Tunnel
if (tunnelConfig.dispatchVideoPort) {
    TUNNELS.push({
        name: "VIDEO",
        remotePort: parseInt(tunnelConfig.dispatchVideoPort),
        localHost: tunnelConfig.nvrHost || "127.0.0.1",
        localPort: 5002
    });
}

const conn = new Client();
let isConnected = false;

conn.on('ready', () => {
    console.log('[ReverseTunnel] Client :: ready');
    isConnected = true;

    TUNNELS.forEach(t => {
        conn.forwardIn('127.0.0.1', t.remotePort, (err) => {
            if (err) return console.log(`[ReverseTunnel] Error starting forward for ${t.name} on ${t.remotePort}:`, err.message);
            console.log(`[ReverseTunnel] Forwarding Request Accepted: Remote ${t.remotePort} -> ${t.localHost}:${t.localPort}`);
        });
    });
});

// FIX: ssh2 v1 emits 'tcp connection' with a space!
conn.on('tcp connection', (info, accept, reject) => {
    // Determine target based on info.destPort
    // Note: info.destPort is the port on the server that received the connection
    const tunnel = TUNNELS.find(t => t.remotePort === info.destPort);

    if (!tunnel) {
        console.log(`[ReverseTunnel] Unknown port ${info.destPort}, rejecting.`);
        return reject();
    }

    const stream = accept(); // Accepts the connection, returns a textual stream (Duplex)
    console.log(`[ReverseTunnel] Incoming connection on remote port ${info.destPort}. Bridging to ${tunnel.localHost}:${tunnel.localPort}...`);

    // Connect to Local
    const local = new net.Socket();
    local.connect(tunnel.localPort, tunnel.localHost, () => {
        console.log(`[ReverseTunnel] Local connection established: ${tunnel.name}`);
        stream.pipe(local).pipe(stream);
    });

    local.on('data', (d) => console.log(`[ReverseTunnel] Data from Local (${d.length} bytes)`));
    stream.on('data', (d) => console.log(`[ReverseTunnel] Data from Remote (${d.length} bytes)`));

    local.on('error', (err) => {
        console.error(`[ReverseTunnel] Local socket error (${tunnel.name}):`, err.message);
        stream.end();
    });

    local.on('close', () => {
        console.log(`[ReverseTunnel] Local connection closed.`);
        stream.end();
    });

    stream.on('close', () => {
        console.log(`[ReverseTunnel] Remote stream closed.`);
        local.destroy();
    });
});

conn.on('error', (err) => {
    console.error('[ReverseTunnel] Client error:', err.message);
    isConnected = false;
});

conn.on('close', () => {
    console.log('[ReverseTunnel] Connection closed. Reconnecting in 5s...');
    isConnected = false;
    setTimeout(connect, 5000);
});

function connect() {
    if (isConnected) return;
    console.log(`[ReverseTunnel] Connecting to ${tunnelConfig.dispatchHost}...`);
    conn.connect({
        host: tunnelConfig.dispatchHost,
        port: 22,
        username: 'root', // Hardcoded as per user context
        password: 'TeamS_2k25!' // Hardcoded as per user context
        // privateKey: fs.readFileSync('/path/to/key') // Alternative
    });
}

connect();
