/* local-api/store/cameraStore.js - SINGLE SOURCE OF TRUTH (Strict Trassir Logic) */
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.resolve(__dirname, '../../config/cameras.json');
const ABS_CONFIG_PATH = path.normalize(CONFIG_FILE);

class CameraStore {
    constructor() {
        this.cache = new Map();
        this.load();
    }

    // Data Sanitization - Remove Garbage Fields
    sanitize(cam) {
        if (!cam) return null;

        // Migrate legacy 'pass' to credentials
        if (cam.pass && (!cam.credentials || !cam.credentials.pass)) {
            if (!cam.credentials) cam.credentials = { user: cam.user || 'admin', pass: '' };
            cam.credentials.pass = cam.pass;
        }

        // Ensure credentials object exists
        if (!cam.credentials) cam.credentials = { user: "admin", pass: "" };

        // Clean garbage
        delete cam.pass;
        delete cam.user;
        delete cam.lastLastFrame; // legacy garbage

        return cam;
    }

    load() {
        try {
            if (fs.existsSync(ABS_CONFIG_PATH)) {
                const raw = fs.readFileSync(ABS_CONFIG_PATH, 'utf8');
                let data = JSON.parse(raw);
                if (Array.isArray(data)) {
                    this.cache.clear();
                    data.forEach(c => {
                        if (c.id) {
                            c = this.sanitize(c); // Auto-repair on load
                            // Preserve status from file (don't force OFFLINE)
                            if (!c.status) c.status = "OFFLINE";
                            c.connected = (c.status === "ONLINE");
                            this.cache.set(c.id, c);
                        }
                    });
                    console.log(`[Store] Loaded & Sanitized ${this.cache.size} cameras.`);
                }
            }
        } catch (e) {
            console.error(`[Store] Load Failed: ${e.message}`);
            // Backup corrupt file
            try { fs.copyFileSync(ABS_CONFIG_PATH, ABS_CONFIG_PATH + ".corrupt"); } catch (ex) { }
        }
    }

    save() {
        try {
            const list = [...this.cache.values()].map(c => {
                const copy = { ...c };
                delete copy.lastFrameAt; // Don't persist runtime state
                return this.sanitize(copy);
            });

            // Atomic Write: Write to .tmp then rename
            const tempPath = ABS_CONFIG_PATH + ".tmp";
            fs.writeFileSync(tempPath, JSON.stringify(list, null, 4));
            fs.renameSync(tempPath, ABS_CONFIG_PATH);
        } catch (e) {
            console.error(`[Store] Save Failed: ${e.message}`);
        }
    }

    // THE DEFINITIVE TRIGGER: EVIDENCE OF LIFE
    updateLastFrame(id) {
        const cam = this.cache.get(id);
        if (!cam) return;

        cam.lastFrameAt = Date.now();
        if (cam.status !== "ONLINE") {
            cam.status = "ONLINE";
            cam.connected = true;
            console.log(`[Store] ${cam.name} -> ONLINE (Real Video Detected)`);
            this.save();
        }
    }

    add(camera) { this.cache.set(camera.id, camera); this.save(); }
    get(id) { return this.cache.get(id); }
    update(id, partial) {
        const cam = this.cache.get(id);
        if (!cam) return null;
        Object.assign(cam, partial);
        this.save();
        return cam;
    }
    delete(id) {
        const existed = this.cache.delete(id);
        if (existed) this.save();
        return existed;
    }
    reload() {
        console.log("[Store] Reloading from disk...");
        this.load();
    }
    list() { return [...this.cache.values()]; }
    findByRtsp(rtsp) {
        for (const cam of this.cache.values()) {
            if (cam.streams?.main === rtsp || cam.streams?.sub === rtsp) return cam;
        }
        return null;
    }
}

module.exports = new CameraStore();
