const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const redis = new Redis();

const SNAPSHOT_DIR = "/opt/dss-edge/recorder/ramdisk/snapshots";
const HISTORY_DIR = "/opt/dss-edge/storage/arming_history";
const RETENTION_MS = 72 * 3600 * 1000; // 72h

class ArmingSnapshotService {
    constructor() {
        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
        this._startWatcher();
    }

    _startWatcher() {
        console.log("[ARMING-SERVICE] Watching arming status changes...");
        redis.subscribe("state:arming:change", (err) => {
            if (err) console.error("[ARMING-SERVICE] Redis subscribe error:", err);
        });

        redis.on("message", (channel, message) => {
            if (channel === "state:arming:change") {
                this.captureSnapshots(message); // message is state
            }
        });

        // Cleanup task
        setInterval(() => this.cleanup(), 3600000); // every hour
    }

    captureSnapshots(state) {
        console.log(`[ARMING-SERVICE] Arming state changed to ${state}. Archiving snapshots...`);
        const now = Date.now();
        const files = fs.readdirSync(SNAPSHOT_DIR);

        files.forEach(file => {
            if (file.endsWith('.jpg')) {
                const src = path.join(SNAPSHOT_DIR, file);
                const dest = path.join(HISTORY_DIR, `${now}_${state}_${file}`);
                try {
                    fs.copyFileSync(src, dest);
                } catch (e) { }
            }
        });

        redis.publish("arming:snapshot", JSON.stringify({ state, timestamp: now }));
    }

    cleanup() {
        console.log("[ARMING-SERVICE] Running snapshot cleanup...");
        const now = Date.now();
        const files = fs.readdirSync(HISTORY_DIR);

        files.forEach(file => {
            const filePath = path.join(HISTORY_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > RETENTION_MS) {
                fs.unlinkSync(filePath);
            }
        });
    }
}

new ArmingSnapshotService();
setInterval(() => redis.set("hb:arming_snapshot", Date.now()), 10000);
