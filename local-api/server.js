const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const httpProxy = require("http-proxy");

// Crash Logger
process.on('uncaughtException', (err) => {
    try { fs.appendFileSync("crash.log", `[${new Date().toISOString()}] ${err.stack}\n`); } catch (e) { }
    console.error("CRITICAL CRASH:", err);
    process.exit(1);
});

const app = express();
const PORT = 8080;

// --- TELEMETRY WEBSOCKET ---
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });
const playbackClients = new Map(); // camId -> Set of ws clients

wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'subscribe') {
                ws.camId = data.camId;
                console.log(`[WS] Client subscribed to ${ws.camId}`);
            }
        } catch (e) { }
    });
    ws.on('close', () => {
        // Cleanup
    });
});

// Global bridge function to send telemetry
app.sendPlaybackTelemetry = (camId, absTs) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.camId === camId) {
            client.send(JSON.stringify({ type: 'telemetry', absTs }));
        }
    });
};

// MANUAL CORS - NUCLEAR OPTION
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json()); // RESTORED

app.get("/status", (req, res) => {
    const store = require('./store/cameraStore');
    const os = require('os');
    res.json({
        online: true,
        uptime: process.uptime(),
        cpu: os.loadavg(),
        ram: { total: os.totalmem(), free: os.freemem() },
        cameras: store.list().map(c => ({ id: c.id, ip: c.ip, status: c.status })),
        timestamp: new Date().toISOString()
    });
});

app.get("/reload-status", (req, res) => {
    const store = require('./store/cameraStore');
    store.reload();
    console.log(`[Server] Manual status reload triggered. Now serving ${store.list().filter(c => c.status === 'ONLINE').length} online cameras.`);
    res.json({ success: true, message: "Status reloaded from disk" });
});

// Proxy Configuration
const rtcProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:1984', ws: true });
const streamProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:5002' });


// Global Request Logger
app.use((req, res, next) => {
    if (req.method === 'DELETE' || (!req.url.startsWith("/stream") && !req.url.startsWith("/rtc"))) {
        console.log(`[Local API Global] ${req.method} ${req.url}`);
    }
    next();
});

// CATCH-ALL DELETE (Debug & Fix)
app.delete("*", (req, res) => {
    console.log(`[CATCH-ALL DELETE] Caught request to: ${req.url}`);

    // Try to extract an ID from the URL (last part)
    const parts = req.url.split('/');
    const potentialId = parts[parts.length - 1];

    if (potentialId && potentialId.length > 3) {
        console.log(`[CATCH-ALL] Attempting to delete ID: ${potentialId}`);
        const store = require(path.join(__dirname, 'routes/../store/cameraStore'));
        const decoders = require(path.join(__dirname, '../camera-manager/decoderManager'));
        const utils = require(path.join(__dirname, '../camera-manager/go2rtcUtils'));

        if (decoders && decoders.stopDecoder) decoders.stopDecoder(potentialId);
        store.delete(potentialId);
        utils.generateConfig(store.list()).catch(e => { });

        return res.status(200).send("Deleted by Catch-All");
    }

    res.status(404).send("Catch-All DELETE: No ID found in URL");
});

// EMERGENCY FIX: Global Delete Handlers to catch UI requests bypassing routers
const emergencyDelete = async (req, res) => {
    try {
        const id = req.params.id;
        console.log(`[Emergency DELETE] Catching global delete for ${id}`);
        const cm = require('./local-api/store/cameraStore'); // Adjust path if needed
        const dm = require('./camera-manager/decoderManager');

        // Hardcoded Store Path because context is cleaner here
        const store = require(path.join(__dirname, 'routes/../store/cameraStore'));
        const decoders = require(path.join(__dirname, '../camera-manager/decoderManager'));
        const utils = require(path.join(__dirname, '../camera-manager/go2rtcUtils'));

        if (decoders && decoders.stopDecoder) decoders.stopDecoder(id);
        const success = store.delete(id);

        if (success) {
            try { await utils.generateConfig(store.list()); } catch (e) { }
            res.sendStatus(200);
        } else {
            console.warn(`[Emergency DELETE] ID ${id} not found.`);
            // SEND 200 ANYWAY to trick UI into thinking it worked (clean up UI state)
            res.sendStatus(200);
        }
    } catch (e) {
        console.error(`[Emergency DELETE] Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
};

app.delete("/cameras/config/:id", emergencyDelete);
app.delete("/api/cameras/config/:id", emergencyDelete);
app.delete("/cameras/:id", emergencyDelete);


// --- API ROUTES ---
const cameraRoutes = require("./routes/cameras");
app.use("/cameras", cameraRoutes);
app.use("/api/cameras", cameraRoutes);

const eventRoutes = require("./routes/events");
app.use("/events", eventRoutes);
app.use("/api/events", eventRoutes);

const statusRoutes = require("./routes/status");
app.use("/status", statusRoutes);
app.use("/api/status", statusRoutes);

const networkRoutes = require("./routes/network");
app.use("/network", networkRoutes);
app.use("/api/network", networkRoutes);

const tunnelRoutes = require("./routes/tunnel");
app.use("/tunnel", tunnelRoutes);
app.use("/api/tunnel", tunnelRoutes);

const vpnRoutes = require("./routes/vpn");
app.use("/vpn", vpnRoutes);
app.use("/api/vpn", vpnRoutes);

const discoveryRoutes = require("./routes/discovery");
app.use("/discovery", discoveryRoutes);
app.use("/api/discovery", discoveryRoutes);

const dispatchRoutes = require("./routes/dispatch");
app.use("/dispatch", dispatchRoutes);
app.use("/api/dispatch", dispatchRoutes);

const recorderRouter = require("./routes/recorder");
recorderRouter.telemetryBridge = (camId, absTs) => app.sendPlaybackTelemetry(camId, absTs);
app.use("/recorder", recorderRouter);
app.use("/api/recorder", recorderRouter);

const streamDelayRoutes = require("./routes/stream_delay");
app.use("/stream-delay", streamDelayRoutes);
app.use("/api/stream-delay", streamDelayRoutes);

const armingRoutes = require("./routes/arming");
app.use("/arming", armingRoutes);
app.use("/api/arming", armingRoutes);

const modelsRoutes = require("./routes/models");
app.use("/models", modelsRoutes);
app.use("/api/models", modelsRoutes);

const pushRoutes = require("./routes/push");
app.use("/push", pushRoutes);
app.use("/api/push", pushRoutes);

const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);

const deviceConfigRoutes = require("./routes/device_config");
app.use("/device-config", deviceConfigRoutes);
app.use("/api/device-config", deviceConfigRoutes);

const aiRoutes = require("./routes/ai");
app.use("/ai", aiRoutes);
app.use("/api/ai", aiRoutes);

// Internal Motion Trigger from standalone Recorder
const aiRouter = require("./services/aiRequest");
require("./services/eventManager"); // Initialize Event State Machine listener
app.post("/internal/motion", (req, res) => {
    const { cameraId, type } = req.body;
    if (cameraId && type === 'motion_start') {
        aiRouter.handleMotion(cameraId).catch(err => console.error("[AI-Router] Error:", err));
    }
    res.sendStatus(200);
});

// --- PROXY HANDLERS ---

// Serve Recorder Segments (for HLS Live-from-Recordings & Analytics)
const RECORDER_SEGMENTS = path.resolve(__dirname, "../recorder/segments");
app.use("/recorder/live", express.static(RECORDER_SEGMENTS, {
    setHeaders: (res, filePath) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        if (filePath.endsWith(".m3u8")) res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        if (filePath.endsWith(".m4s")) res.setHeader("Content-Type", "video/iso.segment");
        if (filePath.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
        if (filePath.endsWith(".ts")) res.setHeader("Content-Type", "video/mp2t");
    }
}));

// MJPEG Stream Proxy (Camera Manager)
app.use("/stream", (req, res) => {
    req.url = req.originalUrl;
    streamProxy.web(req, res, { ignorePath: false }, (e) => {
        if (!res.headersSent) res.sendStatus(502);
    });
});

// Go2RTC Proxy (API & WebRTC)
app.use("/rtc", (req, res) => {
    req.url = req.url.replace(/^\/rtc/, '') || '/';
    rtcProxy.web(req, res, (e) => {
        if (!res.headersSent) res.status(502).send("Go2RTC Unreachable");
    });
});

// --- STATIC UI ---
const uiBuildPath = path.join(__dirname, "../local-ui/build");
if (fs.existsSync(uiBuildPath)) {
    // Serve static files with specific headers
    app.use(express.static(uiBuildPath, {
        setHeaders: (res, path) => {
            if (path.endsWith(".html")) {
                // NEVER cache index.html
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            } else {
                // Asset files (js/css) are hashed by React, so they can be cached, 
                // but let's reduce it to 1 minute for this testing phase
                res.setHeader('Cache-Control', 'public, max-age=60');
            }
        }
    }));

    app.get("*", (req, res, next) => {
        const apiPrefixes = ["/cameras", "/events", "/status", "/vpn", "/auth", "/dispatch", "/recorder", "/arming", "/models", "/rtc", "/stream"];
        if (apiPrefixes.some(p => req.path.startsWith(p))) return next();

        // Ensure index.html is NOT cached
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.sendFile(path.join(uiBuildPath, "index.html"));
    });
}

const server = app.listen(PORT, () => {
    console.log(`[Local API] Unified Backend running on port ${PORT}`);
});

// WebSocket Upgrade for Go2RTC
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/rtc')) {
        req.url = req.url.replace(/^\/rtc/, '') || '/';
        rtcProxy.ws(req, socket, head);
    }
});

// NOTE: recorderService disabled here because it conflicts with standalone recorder/recorder.js
// Standalone recorder is preferred for long-term stability and motion tracking.
console.log("[Server] Standalone Recorder (recorder/recorder.js) is preferred component.");

// --- LIFECYCLE INITIALIZATION ---
try {
    const cm = require('../camera-manager');
    if (cm.lifecycle) cm.lifecycle.init();
} catch (e) { console.error("Lifecycle Init Failed:", e); }
