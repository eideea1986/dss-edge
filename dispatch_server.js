const fs = require("fs");
// Crash Logger & Safety
process.on('uncaughtException', (err) => {
    console.error("CRITICAL DISPATCH CRASH:", err);
    try { fs.writeFileSync("dispatch_crash.log", err.toString() + "\n" + err.stack); } catch (e) { }
});

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { connectDB } = require("./database/mongo");
const { startWSS } = require("./websocket");
const config = require("./config");
const storageService = require("./services/storageService");

// Initialize Storage
storageService.init();

// Attempt DB connection but don't crash if fails
try { connectDB(); } catch (e) { console.error("DB Init Fail", e); }

const app = express();
app.use(cors());

// --- CRITICAL: Mount ingest routes BEFORE body-parsers to avoid stream corruption ---
app.use("/api/ingest", require("./routes/ingest"));

app.use(express.json({ limit: "20mb" }));

// Serve snapshots static
app.use("/snapshots", express.static(path.join(__dirname, "snapshots")));

// Routes - Register API routes BEFORE static files/SPA catch-all
app.use("/api/events", require("./routes/events"));
app.use("/api/locations", require("./routes/locations"));
app.use("/api/cameras", require("./routes/cameras"));
app.use("/status", require("./routes/status"));
app.use("/api/clients", require("./routes/clients"));
app.use("/api/crews", require("./routes/crews"));
app.use("/ota", require("./ota/otaRoutes"));
app.use("/vpn", require("./routes/vpn"));
app.use("/api/wireguard", require("./routes/wireguard")); // New WireGuard Manager
app.use("/api/auth", require("./routes/auth")); // Auth Routes
app.use("/api/system", require("./routes/system"));
app.use("/api/playback", require("./routes/playback"));
app.use("/api/proxy", require("./routes/proxy")); // Proxy for Reverse Tunnels

// TRASSIR SCRIPT RECEIVER (Exact path from user)
app.use("/java-app-guard-events-receiver", require("./routes/trassir"));

// Serve React UI Static Files (Robust Deployment)
// Assumes ../ui/build exists relative to backend
const uiBuildPath = path.join(__dirname, "../ui/build");
if (require("fs").existsSync(uiBuildPath)) {
    console.log("[DISPATCH] Serving UI from " + uiBuildPath);
    app.use(express.static(uiBuildPath));

    // SPA Fallback: Any unknown route -> index.html
    app.get("*", (req, res, next) => {
        // Exclude API/Backend routes from falling back to index.html
        if (req.path.startsWith("/api") || req.path.startsWith("/cameras") || req.path.startsWith("/status") || req.path.startsWith("/vpn") || req.path.startsWith("/ota") || req.path.startsWith("/snapshots")) {
            return next();
        }
        res.sendFile(path.join(uiBuildPath, "index.html"));
    });
} else {
    console.warn("[DISPATCH] UI build not found at " + uiBuildPath);
    app.get("/", (req, res) => res.send(`
        <html><body style="font-family:sans-serif; text-align:center; padding:50px;">
            <h1>⚠️ Dispatch Backend Online</h1>
            <p>But the <b>UI Build is Missing</b>.</p>
            <p>Please check the deployment logs. The 'ui/build' folder was not found.</p>
        </body></html>
    `));
}

// Seed Default Admin
const User = require("./models/User");
const seedAdmin = async () => {
    try {
        // Wait for DB connection
        setTimeout(async () => {
            const adminExists = await User.findOne({ username: "admin" });
            if (!adminExists) {
                console.log("[AUTH] Creating default admin...");
                const admin = new User({ username: "admin", password: "DSS2025", role: "admin" });
                await admin.save();
                console.log("[AUTH] Default admin created: admin / DSS2025");
            } else {
                console.log("[AUTH] Admin user verified.");
            }
        }, 5000); // 5s delay to ensure DB connected
    } catch (e) {
        console.error("[AUTH] Seed Error:", e);
    }
};
seedAdmin();

// Catch-all for undefined routes
app.use("*", (req, res) => {
    res.status(404).send("DSS Dispatch: 404 Not Found (Backend is running, but route/UI missing)");
});

const server = http.createServer(app);
startWSS(server);

// Start Reverse Tunnels for Trassir Locations
const Location = require("./database/models/Location");
const tunnelManager = require("./utils/tunnelManager");

// WebSocket Proxy Handler
server.on('upgrade', (req, socket, head) => {
    // Check if it's a proxy request (e.g. /api/proxy/LOC005/ws/stream/...)
    const match = req.url.match(/^\/api\/proxy\/([^\/]+)(.*)/);
    if (match) {
        const locId = match[1];
        const targetPath = match[2]; // e.g. /ws/stream/cam123

        // For LOC005 (SSH Tunnel), the API port is hardcoded or looked up.
        // In this specific setup, LOC005 API tunnel is on 21001.
        let targetPort = null;
        if (locId === 'LOC005') targetPort = 21001;

        if (targetPort) {
            console.log(`[WS-Proxy] Upgrading connection for ${locId} -> 127.0.0.1:${targetPort}${targetPath}`);
            const http = require('http');

            // Create a request to the upstream
            const proxyReq = http.request({
                hostname: '127.0.0.1',
                port: targetPort,
                path: targetPath,
                method: req.method,
                headers: req.headers
            });

            proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
                // Write response headers to client socket
                let headers = 'HTTP/1.1 101 Switching Protocols\r\n';
                headers += 'Upgrade: websocket\r\n';
                headers += 'Connection: Upgrade\r\n';
                if (proxyRes.headers['sec-websocket-accept']) headers += `Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}\r\n`;
                if (proxyRes.headers['sec-websocket-protocol']) headers += `Sec-WebSocket-Protocol: ${proxyRes.headers['sec-websocket-protocol']}\r\n`;
                headers += '\r\n'; // End of headers

                socket.write(headers);

                // Pipe data
                proxySocket.pipe(socket);
                socket.pipe(proxySocket);
            });

            proxyReq.on('error', (e) => {
                console.error(`[WS-Proxy] Error connecting to upstream: ${e.message}`);
                socket.end();
            });

            proxyReq.end();
        } else {
            socket.destroy();
        }
    }
});

const startTunnels = async () => {
    try {
        const trassirLocs = await Location.find({ manufacturer: "TRASSIR", isManual: true });
        // Sort explicitly to match the logic in routes/locations.js
        trassirLocs.sort((a, b) => a.locationId.localeCompare(b.locationId));

        let portBase = 11000;
        let videoPortBase = 12000;

        for (const loc of trassirLocs) {
            // SKIP LOC005 (Managed via SSH Native Tunnel) to avoid EADDRINUSE conflict
            if (loc.locationId === 'LOC005') continue;

            // Assign a port like 11001, 11002 based on index
            const idx = trassirLocs.indexOf(loc);
            const tunnelPort = portBase + (idx + 1);
            const tunnelVideoPort = videoPortBase + (idx + 1);

            try {
                // Start API Tunnel
                const info = await tunnelManager.startTunnel(loc.locationId, tunnelPort);
                console.log(`[Tunnel] ${loc.locationId} API ready on ${info.listenPort} (Agent -> ${info.agentPort})`);

                // Start Video Tunnel
                const infoVideo = await tunnelManager.startTunnel(`${loc.locationId}_VIDEO`, tunnelVideoPort);
                console.log(`[Tunnel] ${loc.locationId} VIDEO ready on ${infoVideo.listenPort} (Agent -> ${infoVideo.agentPort})`);

            } catch (errT) {
                console.error(`[Tunnel] Failed to start ${loc.locationId}:`, errT.message);
            }
        }
    } catch (e) {
        console.error("[Tunnel] Startup Error:", e);
    }
};

server.listen(config.serverPort, () => {
    console.log(`[DISPATCH] Running on port ${config.serverPort}`);
    // Delay slightly to allow DB
    setTimeout(startTunnels, 2000);
});
