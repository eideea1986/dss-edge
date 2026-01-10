const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Crash Logger
process.on('uncaughtException', (err) => {
    try { fs.writeFileSync("crash.log", err.toString() + "\n" + err.stack); } catch (e) { }
    console.error("CRITICAL CRASH:", err);
    process.exit(1);
});

const app = express();
const PORT = 8081; // Changed from 8080

app.use(cors());
app.use(express.json());

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[Local API] ${req.method} ${req.url}`);
    next();
});

// === NO-CACHE MIDDLEWARE - CRITICAL FOR UPDATES ===
app.use((req, res, next) => {
    // Aggressive no-cache for HTML and JS files
    if (req.url.endsWith('.html') || req.url.endsWith('.js') || req.url === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Routes
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

// Internal Motion Trigger
const aiRouter = require("./services/aiRequest");
app.post("/internal/motion", (req, res) => {
    const { cameraIds, type } = req.body;
    if (cameraIds && type === 'motion_start') {
        aiRouter.handleMotion(cameraIds).catch(err => console.error("[AI-Router] Error:", err));
    }
    res.sendStatus(200);
});

// Proxy Setup
const httpProxy = require('http-proxy');
const rtcProxy = httpProxy.createProxyServer({
    target: 'http://127.0.0.1:1984',
    ws: true,
    changeOrigin: true
});

app.use("/stream", (req, res) => {
    req.url = req.originalUrl;
    rtcProxy.web(req, res, { target: 'http://127.0.0.1:5002', ignorePath: false }, (e) => {
        if (!res.headersSent) res.sendStatus(502);
    });
});

app.use("/rtc/api", (req, res) => {
    console.log(`[RTC Proxy] ${req.method} ${req.url} -> 1984/api${req.url}`);
    rtcProxy.web(req, res, { target: 'http://127.0.0.1:1984/api' }, (e) => console.error(e.message));
});

app.use("/rtc", (req, res) => {
    req.url = req.url.replace(/^\/rtc/, '') || '/';
    rtcProxy.web(req, res, (err) => {
        console.error('[RTC Proxy] HTTP Error:', err.message);
        if (!res.headersSent) res.status(502).send("Go2RTC Unreachable");
    });
});

const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);
if (authRoutes.limitless_ensureAdmin) authRoutes.limitless_ensureAdmin();

// AI Proxy
app.get("/ai/modules", (req, res) => {
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

    // Serve static assets with NO CACHE for updates
    app.use(express.static(uiBuildPath, {
        maxAge: 0,
        setHeaders: (res, filepath) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }));

    // SPA Fallback
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

// WebSocket Upgrade Handler
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/rtc')) {
        const oldUrl = req.url;
        req.url = req.url.replace(/^\/rtc/, '') || '/';
        console.log(`[RTC Proxy] WS Upgrade: ${oldUrl} -> ${req.url}`);
        rtcProxy.ws(req, socket, head);
    }
});

// Recorder Service
try {
    const recorderService = require("./services/recorderService");
    setTimeout(() => recorderService.init(), 5000);
} catch (e) {
    console.error("[Server] Recorder Init Failed:", e);
}
