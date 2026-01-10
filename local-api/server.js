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

app.use(cors());
app.use(express.json());

// Proxy Configuration
const rtcProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:1984', ws: true });
const streamProxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:5002' });

// Global Request Logger
app.use((req, res, next) => {
    if (!req.url.startsWith("/stream") && !req.url.startsWith("/rtc")) {
        console.log(`[Local API] ${req.method} ${req.url}`);
    }
    next();
});

// --- API ROUTES ---
app.use("/cameras", require("./routes/cameras"));
app.use("/events", require("./routes/events"));
app.use("/status", require("./routes/status"));
app.use("/network", require("./routes/network"));
app.use("/tunnel", require("./routes/tunnel"));
app.use("/vpn", require("./routes/vpn"));
app.use("/discovery", require("./routes/discovery"));
app.use("/dispatch", require("./routes/dispatch"));
const recorderRouter = require("./routes/recorder");
recorderRouter.telemetryBridge = (camId, absTs) => app.sendPlaybackTelemetry(camId, absTs);
app.use("/recorder", recorderRouter);
app.use("/stream-delay", require("./routes/stream_delay"));
app.use("/arming", require("./routes/arming"));
app.use("/models", require("./routes/models"));
app.use("/push", require("./routes/push"));
app.use("/auth", require("./routes/auth"));
app.use("/device-config", require("./routes/device_config"));
app.use("/ai", require("./routes/ai"));

// Internal Motion Trigger from standalone Recorder
const aiRouter = require("./services/aiRequest");
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
