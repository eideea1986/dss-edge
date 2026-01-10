/* camera-manager/decoderManager.js - Snapshot Poller (Optimized) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cameraStore = require('../local-api/store/cameraStore');

const RAMDISK_DIR = path.resolve(__dirname, '../recorder/ramdisk/snapshots');
const GO2RTC_API = 'http://127.0.0.1:1984/api/frame.jpeg';

class DecoderManager {
    constructor() {
        this.timers = new Map(); // cameraId -> IntervalID
    }

    startAll() {
        if (!fs.existsSync(RAMDISK_DIR)) fs.mkdirSync(RAMDISK_DIR, { recursive: true });
        console.log("[Decoder] Initializing optimized polling...");
        cameraStore.list().forEach(cam => this.startDecoder(cam));
    }

    startDecoder(cam) {
        if (this.timers.has(cam.id)) return;

        console.log(`[Decoder] Starting snapshot poller for ${cam.id}`);

        // Poll immediately then interval
        this.pollSnapshot(cam);
        const timer = setInterval(() => this.pollSnapshot(cam), 5000); // 5 seconds interval
        this.timers.set(cam.id, timer);
    }

    pollSnapshot(cam) {
        const url = `${GO2RTC_API}?src=${cam.id}`;

        http.get(url, (res) => {
            if (res.statusCode === 200) {
                // Camera is ONLINE
                cameraStore.updateLastFrame(cam.id);

                // Save snapshot to ramdisk
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => {
                    const params = Buffer.concat(chunks);
                    const snapPath = path.join(RAMDISK_DIR, `${cam.id}.jpg`);
                    fs.writeFile(snapPath, params, () => { });
                });
            } else {
                // Consume data to free memory
                res.resume();
            }
        }).on('error', (e) => {
            // Camera probably offline or Go2RTC down
            // console.debug(`[Decoder] Poll error ${cam.id}: ${e.message}`);
        });
    }

    stopDecoder(id) {
        if (this.timers.has(id)) {
            clearInterval(this.timers.get(id));
            this.timers.delete(id);
            console.log(`[Decoder] Stopped poller for ${id}`);
        }
    }

    stopAll() {
        for (const [id, timer] of this.timers) {
            clearInterval(timer);
        }
        this.timers.clear();
    }
}

module.exports = new DecoderManager();
