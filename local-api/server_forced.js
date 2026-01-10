const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Crash Logger
process.on('uncaughtException', (err) => {
    try { fs.writeFileSync("crash.log", err.toString() + "\n" + err.stack); } catch (e) { }
    console.error("CRITICAL CRASH:", err);
    if (process.send) process.send({ type: 'error', error: err.message });
    process.exit(1);
});

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// 0. ORCHESTRATOR HEARTBEAT (CRITICAL)
// ---------------------------------------------------------
if (process.send) {
    console.log("[API] Running in Orchestrator Mode");
    // Signal start
    process.send({ type: 'ready' });

    // Heartbeat Loop
    setInterval(() => {
        process.send({
            type: 'heartbeat',
            status: 'running',
            memory: process.memoryUsage()
        });
    }, 2000);
}

// ---------------------------------------------------------
// 1. PROXY SETUP (Optimized for Go2RTC & CameraManager)
// ---------------------------------------------------------

// Helper to prevent proxy crashes
const handleProxyError = (err, req, res) => {
    console.error(`[Proxy Error] ${req.url}:`, err.message);
    if (!res.headersSent) res.status(502).send("Bad Gateway (Proxy Error)");
};

// A. Go2RTC Proxy (Port 1984) - Handles HTTP API & MJPEG Streams
const rtcProxy = httpProxy.createProxyServer({
    target: 'http://127.0.0.1:1984',
    ws: true, // Critical for WebRTC signaling
    changeOrigin: true
});
rtcProxy.on('error', handleProxyError);

// Explicit Route for Go2RTC Streams and API
app.use('/rtc', (req, res) => {
    // Strip /rtc prefix so Go2RTC receives clean paths
    // Example: /rtc/api/streams -> /api/streams
    req.url = req.url.replace(/^\/rtc/, "") || "/";
    rtcProxy.web(req, res);
});

// Upgrade handler for WebSockets (WebRTC signaling)
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/rtc')) {
        req.url = req.url.replace(/^\/rtc/, "") || "/";
        rtcProxy.ws(req, socket, head);
    }
});

// B. Camera Manager Proxy (Port 5002) - Handles Legacy Stream Requests
const streamProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:5002' });
streamProxy.on('error', handleProxyError);
app.use('/stream', (req, res) => streamProxy.web(req, res));

// ---------------------------------------------------------
// 2. API ROUTES (Load Before Static to avoid SPA collision)
// ---------------------------------------------------------
const routesPath = path.join(__dirname, 'routes');
if (fs.existsSync(routesPath)) {
    fs.readdirSync(routesPath).forEach(file => {
        if (file.endsWith('.js') && !file.includes('bak') && !file.includes('temp')) {
            try {
                // Strip .js to get route name (e.g., status, cameras, auth)
                const routeName = file.replace('.js', '');
                const route = require(path.join(routesPath, file));

                // UI expects routes at root (e.g., /status, /cameras)
                app.use(`/${routeName}`, route);
                console.log(`[Routes] Mounted /${routeName} from ${file}`);
            } catch (e) {
                console.error(`[Routes] Failed to load ${file}:`, e.message);
            }
        }
    });
}

// ---------------------------------------------------------
// 3. STATIC FILES & UI (No Cache Headers)
// ---------------------------------------------------------
// Disable caching for all static files to force update at client
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '-1');
    res.set('Pragma', 'no-cache');
    next();
});

const buildPath = path.join(__dirname, '../local-ui/build');
app.use(express.static(buildPath));

// Fallback for React Router (SPA)
app.get('*', (req, res) => {
    // Ensure we don't accidentally serve index.html for missing API calls
    if (req.url.startsWith('/rtc') || req.url.startsWith('/stream')) {
        return res.status(404).send("API Endpoint Not Found");
    }
    res.sendFile(path.join(buildPath, 'index.html'));
});

// ---------------------------------------------------------
// 4. START SERVER (PORT 8080 - SAFE MODE)
// ---------------------------------------------------------
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] Server listening on SAFE port ${PORT}`);
    if (process.send) process.send({ type: 'listening', port: PORT });
});
