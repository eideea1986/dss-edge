const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MotionDetector = require("./motionDetector");
const http = require("http");

// Crash Logger for Recorder
process.on('uncaughtException', (err) => {
    const time = new Date().toISOString();
    const msg = `[${time}] CRITICAL RECORDER CRASH: ${err.message}\n${err.stack}\n`;
    try { fs.appendFileSync(path.join(__dirname, "recorder_crash.log"), msg); } catch (e) { }
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    const time = new Date().toISOString();
    const msg = `[${time}] UNHANDLED REJECTION: ${reason}\n`;
    try { fs.appendFileSync(path.join(__dirname, "recorder_crash.log"), msg); } catch (e) { }
});

const RETENTION_DAYS = 7;
const SEGMENT_DURATION = 60; // 60s segments
const MIN_FREE_SPACE_PERCENT = 10;
const CLEANUP_TARGET_FREE_PERCENT = 15;

// Debug Logging
const logFile = path.join(__dirname, "recorder_debug.log");
function logDebug(msg) {
    const time = new Date().toISOString();
    const line = `[${time}] ${msg}\n`;
    try {
        fs.appendFileSync(logFile, line);
        // Rotate if too big (5MB)
        const stats = fs.statSync(logFile);
        if (stats.size > 5 * 1024 * 1024) {
            fs.writeFileSync(logFile, "");
        }
    } catch (e) { }
}

// UUID Polyfill for older Node versions
function getUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // Simple fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Indexing Headers
const INDEX_DIR = path.join(__dirname, "indexes");
if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true });

// Storage Map File
const STORAGE_MAP_FILE = path.join(__dirname, "storage_map.json");

class StorageManager {
    constructor() {
        this.map = {};
        this.load();
        // Ensure segments dir
        const segDir = path.join(__dirname, "segments");
        if (!fs.existsSync(segDir)) fs.mkdirSync(segDir, { recursive: true });
        this.save(); // Ensure file exists even if empty
    }

    load() {
        try {
            if (fs.existsSync(STORAGE_MAP_FILE)) {
                this.map = JSON.parse(fs.readFileSync(STORAGE_MAP_FILE, 'utf8'));
            } else {
                this.save(); // Init file
            }
        } catch (e) {
            logDebug(`[Storage] Map load error: ${e.message}`);
        }
    }

    save() {
        try {
            fs.writeFileSync(STORAGE_MAP_FILE, JSON.stringify(this.map, null, 2));
        } catch (e) { logDebug(`[Storage] Save error: ${e.message}`); }
    }

    getPathForCamera(camId) {
        if (!this.map[camId]) {
            this.map[camId] = getUUID();
            this.save();
            logDebug(`[Storage] Assigned new UUID path ${this.map[camId]} for camera ${camId}`);
        }
        return path.join(__dirname, "segments", this.map[camId]);
    }
}

const storageMgr = new StorageManager();

class StreamRecorder {
    constructor(cameraId, streamType, url, options = {}) {
        this.cameraId = cameraId;
        this.streamType = streamType;

        // URL SANITIZATION
        if (url && url.includes('\\')) {
            logDebug(`[Recorder:${cameraId}] Sanitizing URL (removing backslashes)`);
            this.url = url.replace(/\\/g, "");
        } else {
            this.url = url;
        }

        this.options = options;

        const camDir = storageMgr.getPathForCamera(cameraId);
        this.baseDir = path.join(camDir, streamType);

        this.activeProcess = null;
        this.stopRequested = false;
        this.lastRestartDate = null;
    }

    get isActive() {
        return this.activeProcess !== null;
    }

    start() {
        if (this.stopRequested) return;
        this.startContinuousMode();
    }

    stop() {
        this.stopRequested = true;
        if (this.activeProcess) {
            logDebug(`[Recorder:${this.cameraId}:${this.streamType}] Stopping FFmpeg...`);
            this.activeProcess.kill('SIGTERM');
            setTimeout(() => {
                if (this.activeProcess) this.activeProcess.kill('SIGKILL');
            }, 2000);
        }
    }

    startContinuousMode() {
        const today = new Date().toISOString().split('T')[0];
        this.lastRestartDate = today;

        const ensureDir = () => {
            const dir = path.join(this.baseDir, today);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            return dir;
        };

        const dayDir = ensureDir();
        const outputPattern = path.join(dayDir, "%H-%M-%S.mp4");

        const args = [
            "-y",
            "-rtsp_transport", "tcp",
            "-i", this.url,
            "-c", "copy",
            "-f", "segment",
            "-segment_time", SEGMENT_DURATION.toString(),
            "-reset_timestamps", "1",
            "-strftime", "1",
            outputPattern
        ];

        this.spawnFFmpeg(args);
    }

    spawnFFmpeg(args) {
        logDebug(`[Recorder:${this.cameraId}:${this.streamType}] Spawning FFmpeg...`);
        try {
            this.activeProcess = spawn("ffmpeg", args);

            this.activeProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed")) {
                    logDebug(`[Recorder:${this.cameraId}:${this.streamType}] FFmpeg Error: ${msg.trim()}`);
                }
            });

            this.activeProcess.on('error', (err) => {
                logDebug(`[Recorder:${this.cameraId}:${this.streamType}] Process Error: ${err.message}`);
            });

            this.activeProcess.on('close', (code) => {
                logDebug(`[Recorder:${this.cameraId}:${this.streamType}] FFmpeg exited with code ${code}`);
                this.activeProcess = null;
                if (!this.stopRequested) {
                    setTimeout(() => {
                        if (!this.stopRequested) this.start();
                    }, 5000);
                }
            });
        } catch (e) {
            logDebug(`[Recorder:${this.cameraId}:${this.streamType}] Spawn Failed: ${e.message}`);
        }
    }
}

// Global Management
const recorders = new Map();

// Disk Management
class RetentionManager {
    constructor() {
        this.segmentsDir = path.join(__dirname, "segments");
        this.indexesDir = path.join(__dirname, "indexes");
        this.lastUsage = { usedPercent: 0, avail: 'Checking...' };
    }

    async getDiskUsage() {
        return new Promise((resolve) => {
            exec("df -h " + __dirname, (err, stdout) => {
                if (err) return resolve(null);
                const lines = stdout.split("\n");
                if (lines.length < 2) return resolve(null);
                const parts = lines[1].trim().split(/\s+/);
                // Filesystem Size Used Avail Use% Mounted
                if (parts.length < 5) return resolve(null);
                const usedPercent = parseInt(parts[4].replace("%", ""));
                const avail = parts[3];
                resolve({ usedPercent, avail });
            });
        });
    }

    async checkAndCleanup() {
        logDebug("[Retention] Checking disk space...");
        const usage = await this.getDiskUsage();
        if (!usage) return;

        this.lastUsage = usage;

        const freePercent = 100 - usage.usedPercent;
        logDebug(`[Retention] Free space: ${freePercent}% (${usage.avail})`);

        if (freePercent < MIN_FREE_SPACE_PERCENT) {
            logDebug(`[Retention] Free space below ${MIN_FREE_SPACE_PERCENT}%. Starting cleanup...`);
            await this.purgeOldestDay();
            setTimeout(() => this.checkAndCleanup(), 5000);
        }
    }
    async purgeOldestDay() {
        const days = new Set();

        // Find all days in segments
        if (fs.existsSync(this.segmentsDir)) {
            const camDirs = fs.readdirSync(this.segmentsDir);
            camDirs.forEach(uuid => {
                const mainPath = path.join(this.segmentsDir, uuid, "main");
                if (fs.existsSync(mainPath)) {
                    fs.readdirSync(mainPath).forEach(d => {
                        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days.add(d);
                    });
                }
            });
        }

        if (days.size === 0) {
            logDebug("[Retention] No recordings found to purge.");
            return;
        }

        const sortedDays = Array.from(days).sort();
        const oldestDay = sortedDays[0];
        logDebug(`[Retention] Purging oldest day: ${oldestDay}`);

        // 1. Delete Segments
        if (fs.existsSync(this.segmentsDir)) {
            const camDirs = fs.readdirSync(this.segmentsDir);
            camDirs.forEach(uuid => {
                const dayPath = path.join(this.segmentsDir, uuid, "main", oldestDay);
                if (fs.existsSync(dayPath)) {
                    logDebug(`[Retention] Deleting folder: ${dayPath}`);
                    try { fs.rmSync(dayPath, { recursive: true, force: true }); } catch (e) { }
                }
                const subPath = path.join(this.segmentsDir, uuid, "sub", oldestDay);
                if (fs.existsSync(subPath)) {
                    try { fs.rmSync(subPath, { recursive: true, force: true }); } catch (e) { }
                }
            });
        }

        // 2. Delete Indexes
        const indexPath = path.join(this.indexesDir, `${oldestDay}.jsonl`);
        if (fs.existsSync(indexPath)) {
            logDebug(`[Retention] Deleting index: ${indexPath}`);
            try { fs.unlinkSync(indexPath); } catch (e) { }
        }
    }

    startAuto() {
        // Run every 15 minutes
        setInterval(() => this.checkAndCleanup(), 15 * 60 * 1000);
        this.checkAndCleanup(); // Initial run
    }
}

const retentionMgr = new RetentionManager();
const { exec } = require("child_process");

function loadConfig() {
    try {
        const configPath = path.resolve(__dirname, "../config/cameras.json");
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) { return []; }
}

function syncRecorders() {
    const cams = loadConfig();
    logDebug(`[Recorder] Syncing ${cams.length} cameras from config...`);
    const specificCamIds = new Set(cams.filter(c => c.enabled).map(c => c.id));

    // 1. Remove disabled/deleted
    for (const [id, recs] of recorders) {
        if (!specificCamIds.has(id)) {
            logDebug(`[Recorder] Removing disabled/deleted camera: ${id}`);
            if (recs.main) recs.main.stop();
            if (recs.sub) recs.sub.stop();
            if (recs.detector) recs.detector.stop();
            recorders.delete(id);
        }
    }

    // 2. Add/Update
    cams.forEach(cam => {
        const camPath = storageMgr.getPathForCamera(cam.id);
        logDebug(`[Recorder] Camera ${cam.id} (${cam.name || cam.ip}) -> Path ID: ${storageMgr.map[cam.id]}`);

        if (!cam.enabled) return;

        const mode = cam.recordingMode || 'continuous';

        // HANDLE OFF MODE
        if (mode === 'off') {
            let rec = recorders.get(cam.id);
            if (rec) {
                logDebug(`[Recorder] Camera ${cam.id} mode is OFF. Stopping recording.`);
                if (rec.main) rec.main.stop();
                if (rec.sub) rec.sub.stop();
                if (rec.detector) rec.detector.stop();
                recorders.delete(cam.id);
            }
            return;
        }

        let rec = recorders.get(cam.id);
        if (!rec) {
            rec = { main: null, sub: null, detector: null };
            recorders.set(cam.id, rec);
        }

        // Use SUB stream for motion detection to save significant CPU (lower resolution)
        const detectUrl = cam.streams?.sub || cam.rtsp || cam.streams?.main || cam.rtspHd;

        // Always run detector if we have a URL, for event logging
        const needsMotion = true;

        if (needsMotion && !rec.detector && detectUrl) {
            logDebug(`[Recorder] Init Motion on SUB stream for ${cam.id}`);
            // Sanitize URL for Motion Detector
            let cleanDetectUrl = detectUrl;
            if (cleanDetectUrl && cleanDetectUrl.includes('\\')) {
                cleanDetectUrl = cleanDetectUrl.replace(/\\/g, "");
            }

            rec.detector = new MotionDetector(cleanDetectUrl, cam.motionSensitivity || 50);
            rec.detector.on('motion_start', () => logIndex(cam.id, 'event_start'));
            rec.detector.on('motion_end', () => logIndex(cam.id, 'event_end'));
            rec.detector.start();
        }

        // Setup Main Stream Recording
        const mainUrl = cam.streams?.main || cam.rtspHd;
        if (mainUrl && !rec.main) {
            rec.main = new StreamRecorder(cam.id, 'main', mainUrl, { mode });
            rec.main.start();
        }

        // Setup Sub Stream Recording
        const subUrl = cam.streams?.sub || cam.rtsp;
        if (subUrl && !rec.sub) {
            rec.sub = new StreamRecorder(cam.id, 'sub', subUrl, { mode });
            rec.sub.start();
        }
    });
}

function logIndex(camId, type) {
    const today = new Date().toISOString().split('T')[0];
    const entry = JSON.stringify({ t: Date.now(), c: camId, e: type }) + "\n";
    fs.appendFile(path.join(INDEX_DIR, `${today}.jsonl`), entry, () => { });
    if (type === 'event_start') logDebug(`[Recorder] Motion START ${camId}`);
}

// Watchdog for day crossing
setInterval(() => {
    const nowDay = new Date().toISOString().split('T')[0];
    for (const [id, recs] of recorders) {
        if (recs.main && recs.main.isActive && recs.main.lastRestartDate !== nowDay) {
            logDebug(`[Recorder:${id}:main] Day changed from ${recs.main.lastRestartDate} to ${nowDay}. Restarting...`);
            recs.main.stop();
            // start() is handled by 'close' listener but we force start if it doesn't
            setTimeout(() => { if (!recs.main.isActive) recs.main.start(); }, 6000);
        }
        if (recs.sub && recs.sub.isActive && recs.sub.lastRestartDate !== nowDay) {
            logDebug(`[Recorder:${id}:sub] Day changed. Restarting...`);
            recs.sub.stop();
            setTimeout(() => { if (!recs.sub.isActive) recs.sub.start(); }, 6000);
        }
    }
}, 600000); // Check every 10 mins

// Watch Config
if (require.main === module) {
    fs.watchFile(path.resolve(__dirname, "../config/cameras.json"), () => {
        logDebug("[Recorder] Config changed, reloading...");
        syncRecorders();
    });

    syncRecorders();
    retentionMgr.startAuto();
    initRecorderStatusServer();
}

function initRecorderStatusServer() {
    const server = http.createServer((req, res) => {
        if (req.url === "/status") {
            const stats = module.exports.getStatus();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(stats));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(5003, () => {
        logDebug("[Recorder] Status server listening on port 5003");
    });
}

// Export for internal API usage
module.exports = {
    getStatus: () => {
        const stats = {
            cameras: {},
            storage: retentionMgr.lastUsage || { usedPercent: 0, avail: '0' }
        };
        for (const [id, recs] of recorders) {
            stats.cameras[id] = {
                main: recs.main ? recs.main.isActive : false,
                sub: recs.sub ? recs.sub.isActive : false,
                motion: recs.detector ? recs.detector.isActive : false
            };
        }
        return stats;
    },
    getRetentionStatus: async () => {
        return await retentionMgr.getDiskUsage();
    },
    getOrphans: () => {
        const cams = loadConfig();
        const activeUUIDs = new Set();
        // Get UUIDs for active cameras
        cams.forEach(c => {
            if (storageMgr.map[c.id]) activeUUIDs.add(storageMgr.map[c.id]);
        });

        const orphans = [];
        const segDir = path.join(__dirname, "segments");
        if (fs.existsSync(segDir)) {
            const dirs = fs.readdirSync(segDir);
            dirs.forEach(uuid => {
                if (!activeUUIDs.has(uuid)) {
                    // This is an orphan
                    const fullPath = path.join(segDir, uuid);
                    try {
                        const stats = fs.statSync(fullPath);
                        orphans.push({
                            uuid: uuid,
                            path: fullPath,
                            birthtime: stats.birthtime,
                            // Ideally calculate size, but that's slow. Just return existence.
                        });
                    } catch (e) { }
                }
            });
        }
        return orphans;
    }
};
