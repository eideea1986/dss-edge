/* camera-manager/healthMonitor.js - Liveness Watchdog (15s Rule) */
const cameraStore = require('../local-api/store/cameraStore');

// CONFIG - Exactly following USER's 15s Rule
const MAX_SILENCE_MS = 15000;
const CHECK_INTERVAL = 5000;

class HealthMonitor {
    constructor() { this.interval = null; }

    start() {
        console.log(`[Watchdog] Active. Threshold: ${MAX_SILENCE_MS}ms`);
        this.interval = setInterval(() => this.runCycle(), CHECK_INTERVAL);
    }

    runCycle() {
        const now = Date.now();
        const cameras = cameraStore.list();

        for (const cam of cameras) {
            const silenceTime = cam.lastFrameAt ? (now - cam.lastFrameAt) : Infinity;

            if (silenceTime > MAX_SILENCE_MS) {
                if (cam.status !== "OFFLINE") {
                    console.warn(`[Watchdog] ${cam.name} (${cam.id}) SILENT for ${Math.round(silenceTime / 1000)}s. Marking OFFLINE.`);
                    cameraStore.update(cam.id, { status: "OFFLINE" });
                }
            }
        }
    }
}

module.exports = new HealthMonitor();
