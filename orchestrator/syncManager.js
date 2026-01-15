const fs = require("fs");
const path = require("path");
const os = require("os");

// Config Paths
const camerasPath = path.resolve(__dirname, "../config/cameras.json");
const dispatchConfigPath = path.resolve(__dirname, "../event-engine/dispatch.json");
const networkConfigPath = path.resolve(__dirname, "../config/network.json");

// Helper to get device IP
function getDeviceIp() {
    // Try to read from network.json first
    try {
        if (fs.existsSync(networkConfigPath)) {
            const netConf = JSON.parse(fs.readFileSync(networkConfigPath, 'utf8'));
            if (netConf.ip && netConf.ip.length > 7) return netConf.ip;
        }
    } catch (e) { }

    // Fallback to OS interfaces
    const interfaces = os.networkInterfaces();
    let bestIp = "127.0.0.1";

    // 1. Priority: WireGuard (wg0, wg1, etc.)
    for (const name of Object.keys(interfaces)) {
        if (name.startsWith("wg")) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address; // Return immediately if VPN found
                }
            }
        }
    }

    // 2. Fallback: Any non-internal IPv4 (skip Carrier NAT 100.x)
    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes("tailscale")) continue;

        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith("100.")) continue;
                bestIp = iface.address;
            }
        }
    }
    return bestIp;
}

async function performSync(axiosInstance) {
    // Dependency Injection for Axios to avoid module resolution issues
    const axios = axiosInstance || require("axios");

    let dispatchUrls = ["http://localhost:8091"]; // Default Base URL

    // 1. Load Configuration
    try {
        if (fs.existsSync(dispatchConfigPath)) {
            const conf = JSON.parse(fs.readFileSync(dispatchConfigPath, 'utf8'));
            if (conf.dispatchUrls && Array.isArray(conf.dispatchUrls) && conf.dispatchUrls.length > 0) {
                dispatchUrls = conf.dispatchUrls;
            } else if (conf.url) {
                // Legacy support (conf.url might contain /events or not, let's clean it)
                // If it ends in /events, strip it
                let url = conf.url.replace(/\/events\/?$/, "");
                dispatchUrls = [url];
            }
        }
    } catch (e) {
        console.error("[Sync Manager] Config load error", e.message);
    }

    // 2. Load Cameras
    let cameras = [];
    if (fs.existsSync(camerasPath)) {
        try {
            cameras = JSON.parse(fs.readFileSync(camerasPath, 'utf8'));
        } catch (e) { console.error("[Sync Manager] Cameras load error", e.message); }
    }

    // 2b Load Edge Config (Location ID & Name)
    let locId = process.env.LOCATION_ID || "LOC_DEFAULT";
    let edgeName = "Unknown Edge";
    const edgeConfigPath = path.resolve(__dirname, "../config/edge.json");
    try {
        if (fs.existsSync(edgeConfigPath)) {
            const ec = JSON.parse(fs.readFileSync(edgeConfigPath, 'utf8'));
            if (ec.locationId) locId = ec.locationId;
            if (ec.name) edgeName = ec.name;
        }
    } catch (e) { }

    // 3. Prepare Payload
    const payload = {
        locationId: locId,
        name: edgeName, // Send Edge Name
        ip: getDeviceIp(),
        cameras: cameras
    };

    console.log(`[Sync Manager] Starting sync for ${cameras.length} cameras...`);

    // 4. Send Request with Failover
    let success = false;
    let lastError = "";

    // 4. Send Request with Failover/Broadcast
    // We will attempt to send to ALL URLs to ensure consistency across interfaces (VPN vs Public)
    // especially if the user has split connectivity.

    let successCount = 0;
    let errors = [];

    for (const url of dispatchUrls) {
        if (!url || typeof url !== 'string') continue;

        const baseUrl = url.replace(/\/$/, "");
        const syncUrl = `${baseUrl}/api/cameras/sync`;

        try {
            console.log(`[Sync Manager] Attempting sync to ${syncUrl}...`);
            const res = await axios.post(syncUrl, payload, { timeout: 5000 });

            if (res.status === 200) {
                console.log(`[Sync Manager] Sync successful to ${baseUrl}`);
                successCount++;

                // 5. Send Heartbeat
                try {
                    let recorderHealth = {};
                    try {
                        recorderHealth = require('../local-api/services/recorderService').getHealth();
                    } catch (e) { }

                    await axios.post(`${baseUrl}/status/heartbeat`, {
                        locationId: payload.locationId,
                        name: payload.name,
                        vpnIp: payload.ip,
                        health: {
                            status: "online",
                            uptime: process.uptime(),
                            recorder: recorderHealth
                        }
                    }, { timeout: 3000 });
                } catch (hbErr) {
                    // ignore heartbeat error
                }
            }
        } catch (err) {
            console.warn(`[Sync Manager] Failed to sync with ${syncUrl}: ${err.message}`);
            errors.push(`${baseUrl}: ${err.message}`);
        }
    }

    if (successCount > 0) {
        return { success: true, message: `Sync successful to ${successCount} servers` };
    }

    console.error(`[Sync Manager] All Dispatch URLs failed.`);
    return { success: false, error: "All Dispatch URLs failed. Errors: " + errors.join(", ") };
}

// Allow standalone execution
if (require.main === module) {
    performSync();
}

module.exports = { performSync };
