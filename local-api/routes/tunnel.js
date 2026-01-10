const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const net = require("net");

const configPath = path.join(__dirname, "../../config/tunnel.json");

// Helper: Load Config
function loadConfig() {
    if (fs.existsSync(configPath)) {
        try {
            return JSON.parse(fs.readFileSync(configPath, "utf8"));
        } catch (e) {
            console.error("[Tunnel API] Config load error:", e);
        }
    }
    return { enabled: false, dispatchHost: "", dispatchApiPort: 0, dispatchVideoPort: 0 };
}

// Helper: Check Connection Status (Simple Socket Check)
function checkConnection(host, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.connect(port, host, () => {
            socket.destroy();
            resolve(true); // Accessible
        });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
}

// GET Config & Status
router.get("/", async (req, res) => {
    const config = loadConfig();

    // Check Status if enabled
    let status = "Deconectat";
    if (config.enabled && config.dispatchHost) {
        // Can we reach the Dispatch Server?
        // Note: Real "Connected" status implies the reverse tunnel is UP. 
        // We can check if *our* local ports (8080/8070) are being bridged, 
        // but easier to check if we can ping the target.
        // Better yet, we can check if the Reverse Tunnel process is running.

        // Check if process running
        // const isRunning = require('child_process').execSync("pgrep -f reverseTunnelClient").toString().length > 0;

        // Real connection check
        const canReachDispatch = await checkConnection(config.dispatchHost, config.dispatchApiPort);
        status = canReachDispatch ? "Conectat (Server Accesibil)" : "Eroare Conexiune Server";
    }

    res.json({ ...config, status });
});

// SAVE Config
router.post("/", (req, res) => {
    try {
        const newConfig = req.body;
        // Validate
        if (!newConfig.dispatchHost || !newConfig.dispatchApiPort) {
            return res.status(400).json({ error: "Host and API Port are required" });
        }

        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        console.log("[Tunnel API] Config saved:", newConfig);

        // Restart Service to apply changes
        exec("systemctl restart dss-edge", (err) => {
            if (err) console.error("[Tunnel API] Restart failed:", err);
            else console.log("[Tunnel API] Service restarting...");
        });

        res.json({ status: "ok", message: "Saved. Restarting..." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
