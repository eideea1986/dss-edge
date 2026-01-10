/* camera-manager/lifecycle.js - System Startup & Persistent Decoders */
const cameraStore = require('../local-api/store/cameraStore');
const startStream = require('./startStream');
const healthMonitor = require('./healthMonitor');
const decoderManager = require('./decoderManager');

async function init() {
    console.log("[Lifecycle] Booting Trassir-Style Camera System...");

    // 1. Ensure Store is Loaded
    cameraStore.load();
    const cameras = cameraStore.list();

    console.log(`[Lifecycle] Found ${cameras.length} cameras. Initializing...`);

    // 2. Start Go2RTC Registration (Managed separately)
    for (const cam of cameras) {
        try { await startStream(cam); } catch (e) { }
    }

    // 3. START PERSISTENT DECODERS (Heartbeat Source)
    decoderManager.startAll();

    // 4. Start Health Watchdog (Timeout logic)
    healthMonitor.start();

    console.log("[Lifecycle] System Ready. Decoder Loop active.");
}

module.exports = { init };
