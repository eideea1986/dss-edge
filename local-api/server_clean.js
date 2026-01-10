const fs = require("fs");
const path = require("path");

// Crash Logger
process.on('uncaughtException', (err) => {
    try { fs.writeFileSync("crash.log", err.toString() + "\n" + err.stack); } catch (e) { }
    console.error("CRITICAL CRASH:", err);
    process.exit(1);
});

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const networkRoutes = require("./routes/network");
const app = express();

const PORT = 8080;

app.use(cors());
app.use(express.json());

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[Local API] ${req.method} ${req.url}`);
    next();
});

// Routes
app.use("/cameras", require("./routes/cameras"));
app.use("/events", require("./routes/events"));
app.use("/status", require("./routes/status"));
app.use("/network", networkRoutes);
app.use("/tunnel", require("./routes/tunnel"));
app.use("/vpn", require("./routes/vpn"));
app.use("/discovery", require("./routes/discovery"));
app.use("/dispatch", require("./routes/dispatch"));
app.use("/recorder", require("./routes/recorder"));
app.use("/arming", require("./routes/arming"));
app.use("/models", require("./routes/models"));
app.use("/push", require("./routes/push"));

// Internal Motion Trigger from Recorder
const aiRouter = require("./services/aiRequest");
app.post("/internal/motion", (req, res) => {
    const { cameraIds, type } = req.body;
    if (cameraIds && type === 'motion_start') {
        // Fire and forget - don't block the recorder
        aiRouter.handleMotion(cameraIds).catch(err => console.error("[AI-Router] Error:", err));
    }
    res.sendStatus(200);
});

// Proxy for MJPEG (port 5002) - Fix path duplication
const httpProxy = require('http-proxy');
const rtcProxy = httpProxy.createProxyServer({
    target: 'http://127.0.0.1:1984',
    ws: true,
    changeOrigin: true
});

app.use("/stream", (req, res) => {
    // CameraManager 5002 expects /stream/cam_id, and we are mounted at /stream
    // req.url here is just "/cam_id" because Express strips the mount point
    // So we need to prepend /stream
    req.url = req.originalUrl; // Use full original URL to be safe, e.g. /stream/cam_id
    rtcProxy.web(req, res, { target: 'http://127.0.0.1:5002', ignorePath: false }, (e) => {
        if (!res.headersSent) res.sendStatus(502);
    });
});

// Proxy for Go2RTC API & WebRTC (port 1984)
app.use("/rtc/api", (req, res) => {
    // Go2RTC expects /api/...
    console.log(`[RTC Proxy] ${req.method} ${req.url} -> 1984/api${req.url}`);
    rtcProxy.web(req, res, { target: 'http://127.0.0.1:1984/api' }, (e) => console.error(e.message));
});

// Proxy for Go2RTC WebRTC signaling
app.use("/rtc", (req, res) => {
    // Manually strip /rtc from the URL for the proxy
    req.url = req.url.replace(/^\/rtc/, '') || '/';
    rtcProxy.web(req, res, (err) => {
        console.error('[RTC Proxy] HTTP Error:', err.message);
        if (!res.headersSent) res.status(502).send("Go2RTC Unreachable");
    });
});

const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);

// Ensure default admin exists on startup
if (authRoutes.limitless_ensureAdmin) authRoutes.limitless_ensureAdmin();

// AI Proxy
app.get("/ai/modules", (req, res) => {
    // Return standard list for UI compatibility
    res.json([
        { name: "ai_small", classes: ["person", "car", "bus", "truck"] },
        { name: "ai_medium", classes: ["person", "car", "bus", "truck", "motorcycle"] },
        { name: "ai_premium", classes: ["person", "car", "face", "license_plate"] }
    ]);
});

// Serve React UI Static Files
const uiBuildPath = path.join(__dirname, "../local-ui/build");
if (fs.existsSync(uiBuildPath)) {
    console.log("[Local API] Serving UI from " + uiBuildPath);

    // 1. Serve static assets with standard caching (bundles have hashes anyway)
    app.use(express.static(uiBuildPath, {
        maxAge: '4h',
        setHeaders: (res, path) => {
            if (path.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            }
        }
    }));

    // 2. Fallback for SPA (index.html) - No cache for the entry point
    app.get("*", (req, res, next) => {
        const apiPrefixes = ["/cameras", "/events", "/status", "/vpn", "/auth", "/dispatch", "/recorder", "/arming", "/models", "/rtc", "/stream"];
        if (apiPrefixes.some(p => req.path.startsWith(p))) {
            return next();
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.sendFile(path.join(uiBuildPath, "index.html"));
    });
}

const server = app.listen(PORT, () => {
    console.log(`[Local API] Running on port ${PORT}`);
});

// CRITICAL: Handle WebSocket Upgrade manually for the proxy
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/rtc')) {
        const oldUrl = req.url;
        // Strip /rtc prefix for Go2RTC
        req.url = req.url.replace(/^\/rtc/, '') || '/';
        console.log(`[RTC Proxy] WS Upgrade: ${oldUrl} -> ${req.url}`);
        rtcProxy.ws(req, socket, head);
    }
});

// Recorder Service (Restored)
try {
    const recorderService = require("./services/recorderService");
    // Delay slightly to ensure Go2RTC is up?
    setTimeout(() => recorderService.init(), 5000);
} catch (e) {
    console.error("[Server] Recorder Init Failed:", e);
}
