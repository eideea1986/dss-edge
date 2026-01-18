/**
 * DSS Enterprise Recorder V2 (Strict Mode)
 * - Hierarchical Storage: camId/YYYY/MM/DD/HH/MM-SS.mp4
 * - Strict GOP Alignment
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const Redis = require("ioredis");
const sqlite3 = require("sqlite3").verbose();

// --- CONFIGURATION ---
const CONFIG = {
    SEGMENT_DURATION: 5,
    FPS: 25,
    STORAGE_ROOT: "/opt/dss-edge/storage",
    WORK_DIR: "/opt/dss-edge/recorder/work",
    CONFIG_FILE: "/opt/dss-edge/config/cameras.json",
    REDIS_STREAM_KEY: "storage:segments",
    HEARTBEAT_KEY: "hb:recorder",
    SYNC_INTERVAL_MS: 30000,
    POLL_INTERVAL_MS: 1000
};

const redis = new Redis();
const activeRecorders = new Map();

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG.CONFIG_FILE, "utf8"));
    } catch (e) { return []; }
}

// EXEC-34: Probe Manager (Connectivity Witness)
class ProbeManager {
    constructor() {
        this.cache = new Map(); // camId -> { ready: bool, ts: number }
    }

    async check(cam) {
        // 1. Check Cache (valid 10s)
        const cached = this.cache.get(cam.id);
        if (cached && Date.now() - cached.ts < 10000) return cached.ready;

        // 2. Perform Active Probe (Hard Gate)
        console.log(`[RECORDER] Gating: Probing ${cam.id}...`);
        const user = cam.credentials?.user || cam.user || "admin";
        const pass = cam.credentials?.pass || cam.pass || "admin";
        const url = cam.streams?.main || cam.rtsp_main || `rtsp://${user}:${pass}@${cam.ip}:554/cam/realmonitor?channel=1&subtype=0`;

        return new Promise((resolve) => {
            const args = [
                "-v", "error", "-rtsp_transport", "tcp", "-i", url, "-select_streams", "v:0",
                "-show_entries", "frame=pkt_pts_time", "-read_intervals", "%+#3", "-of", "csv=p=0"
            ];
            const proc = spawn("ffprobe", args, { timeout: 5000 }); // 5s timeout
            proc.on('close', (code) => {
                const isReady = (code === 0);
                this.cache.set(cam.id, { ready: isReady, ts: Date.now() });
                if (!isReady) console.warn(`[RECORDER] Gate Closed: Probe failed for ${cam.id}`);
                resolve(isReady);
            });
            proc.on('error', () => resolve(false));
        });
    }
}

class RecorderV2 {
    // EXEC-33 & 34: Functional Truth & Gating
    constructor() {
        this.lastWriteMap = new Map(); // camId -> timestamp
        this.byteCountMap = new Map(); // camId -> bytes (last interval)
        this.probe = new ProbeManager(); // EXEC-34
        this.suspended = new Set(); // Cams waiting for probe
    }

    start() {
        console.log("[RECORDER-V2] Engine Starting (EXEC-34 Enforced: GATING & FAIL-FAST)...");
        this.sync();
        setInterval(() => this.sync(), CONFIG.SYNC_INTERVAL_MS);
        setInterval(() => this.heartbeat(), 2000);
        setInterval(() => this.poll(), CONFIG.POLL_INTERVAL_MS);

        // EXEC-34: Fail-Fast Watchdog (10s tolerance)
        setInterval(() => this.validateFunctionality(), 5000);
    }

    heartbeat() {
        redis.set(CONFIG.HEARTBEAT_KEY, Date.now());

        const metrics = {
            active_writers: this.lastWriteMap.size,
            total_cameras: activeRecorders.size,
            suspended: this.suspended.size,
            timestamp: Date.now(),
            status: (this.lastWriteMap.size > 0 || this.suspended.size > 0) ? "OPERATIONAL" : "IDLE"
        };
        redis.set("recorder:functional_proof", JSON.stringify(metrics));
    }

    validateFunctionality() {
        const now = Date.now();
        const MAX_SILENCE = 10000; // EXEC-34: 10s Strict Limit

        for (const [id, state] of activeRecorders) {
            const lastWrite = this.lastWriteMap.get(id) || state.startTime || 0;
            const age = now - lastWrite;

            // If process exists but no writes
            if (state.proc && age > MAX_SILENCE) {
                console.error(`[RECORDER] FAIL-FAST: ${id} silent for ${Math.floor(age / 1000)}s. KILLING.`);
                state.proc.kill('SIGKILL');
                activeRecorders.delete(id);
                this.lastWriteMap.delete(id);
                this.suspended.add(id); // Move to suspension (retry via probe)

                redis.hset("recorder:cam_status", id, "FAIL_FAST_SUSPENDED");
            }
        }
    }

    sync() {
        const cameras = loadConfig();
        const activeIds = new Set(cameras.map(c => c.id));

        cameras.forEach(async cam => {
            // EXEC-34: Gating Logic
            // If active, do nothing
            if (activeRecorders.has(cam.id)) return;

            // If disabled/offline, ensure stopped
            if (cam.enabled === false) {
                this.suspended.delete(cam.id);
                return;
            }

            // If not active, try to spawn. 
            // BUT FIRST: PROBE GATE
            this.suspended.add(cam.id); // Mark as candidate

            // Check gate (Async)
            const isReady = await this.probe.check(cam);

            if (isReady && !activeRecorders.has(cam.id)) {
                this.suspended.delete(cam.id);
                this.spawn(cam);
            } else {
                // Stay in suspended
            }
        });

        for (const [id, state] of activeRecorders) {
            if (!activeIds.has(id)) {
                if (state.proc) state.proc.kill();
                activeRecorders.delete(id);
                this.lastWriteMap.delete(id); // Clean map
            }
        }
    }



    async cleanupStale(camId) {
        // ... (keep existing cleanup logic)
        const dbPath = path.join(CONFIG.STORAGE_ROOT, camId, "index.db");
        if (!fs.existsSync(dbPath)) return;

        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(dbPath);
            const now = Date.now();
            db.all("SELECT path FROM segments WHERE end_ts >= ?", [now], (err, rows) => {
                if (err) { db.close(); return resolve(); }
                if (rows.length > 0) {
                    rows.forEach(row => { try { if (row.path && fs.existsSync(row.path)) fs.unlinkSync(row.path); } catch (e) { } });
                }
                db.run("DELETE FROM segments WHERE end_ts >= ?", [now], (err) => { db.close(); resolve(); });
            });
        });
    }

    async spawn(cam) {
        if (activeRecorders.has(cam.id)) return;

        // Lock: Mark as starting to prevent double-spawn
        activeRecorders.set(cam.id, { status: "starting" });

        try {
            await this.cleanupStale(cam.id);
        } catch (e) {
            activeRecorders.delete(cam.id);
            return;
        }

        const camStorage = path.join(CONFIG.STORAGE_ROOT, cam.id);
        const camWork = path.join(CONFIG.WORK_DIR, cam.id);
        ensureDir(camStorage);
        ensureDir(camWork);

        const listFile = path.join(camWork, "segments.csv");

        // Pattern hierarchical
        const segmentPattern = `${camStorage}/%Y/%m/%d/%H/%M-%S.mp4`;

        const user = cam.credentials?.user || cam.user || "admin";
        const pass = cam.credentials?.pass || cam.pass || "admin";
        const url = cam.streams?.main || cam.rtsp_main || `rtsp://${user}:${pass}@${cam.ip}:554/cam/realmonitor?channel=1&subtype=0`;

        // Pre-create some subfolders for the current hour
        const now = new Date();
        const hourPath = path.join(camStorage,
            String(now.getFullYear()),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0')
        );
        ensureDir(hourPath);

        const args = [
            "-hide_banner", "-y", "-loglevel", "error",
            "-rtsp_transport", "tcp",
            "-i", url,
            "-an",
            "-c:v", "copy",
            "-map", "0:v:0",

            "-f", "segment",
            "-segment_time", CONFIG.SEGMENT_DURATION.toString(),
            "-segment_atclocktime", "1",
            "-reset_timestamps", "1",
            "-strftime", "1",

            "-segment_list", listFile,
            "-segment_list_type", "csv",
            "-segment_list_size", "20",
            "-segment_list_flags", "+live",
            "-segment_format", "mp4",
            "-movflags", "+faststart+frag_keyframe+empty_moov",
            segmentPattern
        ];

        const proc = spawn("ffmpeg", args, { stdio: "inherit" });
        // EXEC-33: Register start time for watchdog
        this.lastWriteMap.set(cam.id, Date.now());

        proc.on("exit", () => {
            activeRecorders.delete(cam.id);
            this.lastWriteMap.delete(cam.id);
            console.warn(`[RECORDER] ${cam.id} died.`);
        });

        activeRecorders.set(cam.id, { proc, listFile, processed: new Set() });
    }

    poll() {
        for (const [id, state] of activeRecorders) {
            if (!fs.existsSync(state.listFile)) continue;
            try {
                const lines = fs.readFileSync(state.listFile, "utf8").trim().split("\n");
                lines.forEach(line => {
                    const [file] = line.split(",");
                    if (!file || state.processed.has(file)) return;

                    state.processed.add(file);
                    if (state.processed.size > 100) state.processed.delete(state.processed.values().next().value);

                    const now = new Date();
                    const hierarchicalPath = path.join(
                        String(now.getFullYear()),
                        String(now.getMonth() + 1).padStart(2, '0'),
                        String(now.getDate()).padStart(2, '0'),
                        String(now.getHours()).padStart(2, '0'),
                        file
                    );

                    const fullPath = path.join(CONFIG.STORAGE_ROOT, id, hierarchicalPath);

                    if (fs.existsSync(fullPath)) {
                        const stat = fs.statSync(fullPath);
                        if (stat.size > 0) { // BYTE-LEVEL TRUTH
                            // EXEC-33: Functional Proof Confirmed
                            this.lastWriteMap.set(id, Date.now());
                            redis.hset("recorder:cam_status", id, "RECORDING");

                            const endTs = stat.mtimeMs;
                            const startTs = endTs - (CONFIG.SEGMENT_DURATION * 1000);

                            redis.xadd(CONFIG.REDIS_STREAM_KEY, "*",
                                "type", "record.segment.v2",
                                "cameraId", id,
                                "startTs", startTs.toString(),
                                "endTs", endTs.toString(),
                                "durationMs", (endTs - startTs).toString(),
                                "path", fullPath
                            );

                            // PROOF OF ACTIVITY (Global + Per Camera + File)
                            const nowTs = Date.now();
                            // redis.set(CONFIG.ACTIVITY_KEY, nowTs); // Fixed: ACTIVITY_KEY undefined in previous code
                            redis.hset("recorder:last_write", id, nowTs);
                            redis.hset("recorder:current_file", id, fullPath);
                        }
                    }
                    // Periodic mkdir for next potential hour
                    const nextHour = new Date(Date.now() + 3600000);
                    const nextPath = path.join(CONFIG.STORAGE_ROOT, id,
                        String(nextHour.getFullYear()),
                        String(nextHour.getMonth() + 1).padStart(2, '0'),
                        String(nextHour.getDate()).padStart(2, '0'),
                        String(nextHour.getHours()).padStart(2, '0')
                    );
                    ensureDir(nextPath);
                });
            } catch (e) { }
        }
    }
}

new RecorderV2().start();
