const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { execSync } = require('child_process');

const CAMERAS_FILE = path.join(__dirname, "../../config/cameras.json");

// Helper to read cameras
const getCameras = () => {
    try {
        if (!fs.existsSync(CAMERAS_FILE)) return [];
        return JSON.parse(fs.readFileSync(CAMERAS_FILE, "utf8"));
    } catch (e) {
        return [];
    }
};

// Helper to save cameras
const saveCameras = (cameras) => {
    fs.writeFileSync(CAMERAS_FILE, JSON.stringify(cameras, null, 2));
    // Trigger Go2RTC regen (optional but good)
    try {
        const { exec } = require('child_process');
        exec('node /opt/dss-edge/gen_go2rtc_yaml.js', (err, stdout) => {
            if (err) console.error("Go2RTC Regen Failed:", err);
            else console.log("Go2RTC Config Regenerated.");
        });
    } catch (e) { }
};

// Camera Manager Interaction
const CAM_MANAGER_URL = "http://127.0.0.1:5002"; // Internal Camera Manager
const GO2RTC_URL = "http://127.0.0.1:1984";

// --- ROUTES ---

// GET /config - List all cameras with merged status
router.get("/config", async (req, res) => {
    let cameras = getCameras();

    // Merge live status from Camera Manager
    try {
        const statusRes = await axios.get(`${CAM_MANAGER_URL}/status`, { timeout: 1000 });
        const statuses = statusRes.data || {};

        cameras = cameras.map(cam => {
            // Check connected status (normalize keys)
            const id = cam.id.trim();
            const isOnline = statuses[id] && statuses[id].connected;

            return {
                ...cam,
                connected: isOnline ? true : false,
                status: isOnline ? "Online" : "Offline"
            };
        });
    } catch (e) {
        console.warn("[API] Camera Manager status unavailable:", e.message);
    }

    res.json(cameras);
});

// POST /config - Update camera list
router.post("/config", (req, res) => {
    const newCameras = req.body;
    if (!Array.isArray(newCameras)) return res.status(400).send("Invalid format");
    saveCameras(newCameras);

    // Notify Camera Manager to reload (if implemented)
    axios.post(`${CAM_MANAGER_URL}/reload`).catch(() => { });

    res.json({ success: true });
});

// GET /status - Raw status proxy
router.get("/status", async (req, res) => {
    try {
        const resp = await axios.get(`${CAM_MANAGER_URL}/status`);
        // Normalize keys
        const clean = {};
        Object.keys(resp.data).forEach(k => {
            clean[k.trim()] = resp.data[k];
        });
        res.json(clean);
    } catch (e) {
        res.status(502).json({ error: "Camera Manager unavailable" });
    }
});

// Device Factory for Verification
const DeviceFactory = require("../../camera-manager/adapters/DeviceFactory");

// POST /verify - Check Camera Connection & RTSP
router.post("/verify", async (req, res) => {
    console.log(`[API] Verifying ${req.body.manufacturer} at ${req.body.ip}...`);
    try {
        const config = req.body; // { ip, port, user, pass, manufacturer, rtspUrl? }
        const adapter = DeviceFactory.createAdapter(config);

        // 1. Adapther Login Check
        const connected = await adapter.connect();

        if (connected) {
            // 2. Determine RTSP URL
            let streamUri = config.rtspUrl || "";

            // If not provided by UI math, try to guess/fetch
            if (!streamUri) {
                try {
                    streamUri = await adapter.getStreamUri('101');
                } catch (e) { }

                // Fallbacks if adapter failed to get URI
                if (!streamUri) {
                    if (config.manufacturer === 'Trassir') {
                        streamUri = `rtsp://${config.user}:${config.pass}@${config.ip}:554/live/sub`;
                    } else {
                        streamUri = `rtsp://${config.user}:${config.pass}@${config.ip}:554/Streaming/Channels/101`;
                    }
                }
            }

            // 3. Verify Video (Heavy Check with ffprobe script)
            console.log(`[API] Testing RTSP Stream: ${streamUri}`);
            try {
                // Call external script with 7s timeout
                // verify_rtsp.sh content: timeout 10 ffprobe ...
                const result = execSync(`/opt/dss-edge/verify_rtsp.sh "${streamUri}"`, { timeout: 12000, encoding: 'utf-8' });

                if (result.trim() === "OK") {
                    res.json({
                        status: "ok",
                        message: "Device Connected & Video Verified",
                        details: { streamUri }
                    });
                } else {
                    // Login OK, Video Fail
                    res.json({
                        status: "partial_error",
                        error: "Login OK, but RTSP Timed out (Video Unreachable)",
                        details: { streamUri }
                    });
                }
            } catch (err) {
                console.error("[API] RTSP Check Error:", err.message);
                // Script timeout or execution error
                res.json({
                    status: "partial_error",
                    error: "Login OK, but RTSP Verification Failed/Timed out",
                    details: { streamUri }
                });
            }

        } else {
            res.status(504).json({ error: "Connection Failed (Login/Auth Error)" });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});


module.exports = router;
