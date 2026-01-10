const fs = require("fs");
// Crash Logger
process.on('uncaughtException', (err) => {
    try { fs.writeFileSync("crash.log", err.toString() + "\n" + err.stack); } catch (e) { }
    console.error("CRITICAL CRASH:", err);
    process.exit(1);
});

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const httpProxy = require("http-proxy");
const path = require("path");

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json());

// Singleton Proxy Server
const rtcProxy = httpProxy.createProxyServer({
    ws: true
});
rtcProxy.on('error', (err, req, res) => {
    // console.error('[Proxy Error]', err.message);
    if (res && !res.headersSent) {
        res.writeHead(502);
        res.end('Proxy Error');
    }
});

// Global Request Logger
app.use((req, res, next) => {
    // console.log(`[Local API] ${req.method} ${req.url}`);
    next();
});

// --- ROUTES ---
app.use("/cameras", require("./routes/cameras"));
app.use("/events", require("./routes/events"));
app.use("/status", require("./routes/status"));
app.use("/network", require("./routes/network"));
app.use("/tunnel", require("./routes/tunnel"));
app.use("/vpn", require("./routes/vpn"));
app.use("/discovery", require("./routes/discovery"));
app.use("/dispatch", require("./routes/dispatch"));
app.use("/recorder", require("./routes/recorder"));
app.use("/arming", require("./routes/arming"));
app.use("/models", require("./routes/models"));
app.use("/push", require("./routes/push"));
app.use("/auth", require("./routes/auth"));

// --- PROXIES ---

// 1. MJPEG Proxy (Camera Manager port 5002)
app.use("/stream", (req, res) => {
    req.url = req.originalUrl; // Keep /stream/cam_id structure
    rtcProxy.web(req, res, { target: 'http://127.0.0.1:5002', ignorePath: false });
});

// 2. Go2RTC API (port 1984)
// Maps /rtc/api/... -> 1984/api/...
app.use("/rtc/api", (req, res) => {
    // req.url here is whatever is after /rtc/api. e.g. /streams
    // rtcProxy behaves by appending req.url to target if prependPath is true (default).
    // So target 1984/api + /streams = 1984/api/streams. Correct.
    rtcProxy.web(req, res, { target: 'http://127.0.0.1:1984/api' });
});

// 3. Go2RTC Signaling / WebRTC / WS
app.use("/rtc", (req, res) => {
    // Proxy root /rtc to 1984 root. 
    // Express strips /rtc. req.url is /.
    rtcProxy.web(req, res, { target: 'http://127.0.0.1:1984' });
});


// Login Init
const authRoutes = require("./routes/auth");
if (authRoutes.limitless_ensureAdmin) authRoutes.limitless_ensureAdmin();

// AI Proxy
const aiRouter = require("./services/aiRequest");
app.post("/internal/motion", (req, res) => {
    const { cameraId, type } = req.body;
    if (cameraId && type === 'motion_start') aiRouter.handleMotion(cameraId).catch(() => { });
    res.sendStatus(200);
});
app.get("/ai/modules", (req, res) => {
    res.json([
        { name: "ai_small", classes: ["person", "car"] },
        { name: "ai_medium", classes: ["person", "car", "bus", "truck"] },
        { name: "ai_premium", classes: ["person", "face", "license_plate"] }
    ]);
});

// --- STATIC UI ---
const uiBuildPath = path.join(__dirname, "../local-ui/build");
if (fs.existsSync(uiBuildPath)) {
    console.log("[Local API] Serving UI from " + uiBuildPath);

    app.use(express.static(uiBuildPath, {
        maxAge: '4h',
        setHeaders: (res, path) => {
            if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        }
    }));

    app.get("*", (req, res, next) => {
        const apiPrefixes = ["/cameras", "/events", "/status", "/vpn", "/auth", "/dispatch", "/recorder", "/arming", "/models", "/rtc", "/stream"];
        if (apiPrefixes.some(p => req.path.startsWith(p))) return next();

        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(uiBuildPath, "index.html"));
    });
}

// Upgrade handler for Websockets (Go2RTC)
const server = app.listen(PORT, () => {
    console.log(`[Local API] Running on port ${PORT}`);
});

server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/rtc')) {
        // Strip /rtc prefix for WS connection too?
        req.url = req.url.replace(/^\/rtc/, '') || '/';
        rtcProxy.ws(req, socket, head, { target: 'http://127.0.0.1:1984' });
    }
});
