const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

const CONFIG_PATH = "/opt/dss-edge/config/cameras.json";
const STORAGE_ROOT = "/opt/dss-edge/storage";
const RECORDER_BIN = "/opt/dss-edge/recorder_cpp/build/recorder";

let RECORDERS = {};
let lastWriteAt = {};
let isSyncing = false;

function loadCameras() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, "utf8");
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

const DB_CONNS = {};

function getDb(camId) {
    if (DB_CONNS[camId]) return DB_CONNS[camId];
    const dbDir = path.join(STORAGE_ROOT, camId);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const dbPath = path.join(dbDir, 'index.db');
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file TEXT UNIQUE,
            start_ts INTEGER,
            end_ts INTEGER,
            type TEXT DEFAULT 'segment'
        )`);
        db.run("CREATE INDEX IF NOT EXISTS idx_start ON segments(start_ts)");
    });

    DB_CONNS[camId] = db;
    return db;
}

function addSegmentToDb(camId, segmentFile, endTs) {
    const db = getDb(camId);
    const durationCount = 3000; // 3s
    const start = endTs - durationCount;

    db.run(
        "INSERT OR REPLACE INTO segments (file, start_ts, end_ts) VALUES (?, ?, ?)",
        [segmentFile, start, endTs],
        (err) => {
            if (err) console.error(`[Orchestrator] DB Error (${camId}):`, err.message);
        }
    );
}

function startRecorder(cam, rtspUrl) {
    if (RECORDERS[cam.id]) return;

    console.log(`[Orchestrator] Starting recorder for ${cam.id} -> ${rtspUrl}`);
    const proc = spawn(RECORDER_BIN, [
        "--camera-id", cam.id,
        "--rtsp", rtspUrl,
        "--out", STORAGE_ROOT
    ]);

    RECORDERS[cam.id] = proc;
    lastWriteAt[cam.id] = Date.now();

    proc.stdout.on("data", data => {
        const lines = data.toString().split('\n');
        for (let line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.event === "segment_written") {
                    lastWriteAt[cam.id] = Date.now();
                    const end = msg.ts * 1000;
                    addSegmentToDb(cam.id, msg.file, end);
                }
            } catch (e) {
                // partial json or log line
            }
        }
    });

    proc.on("exit", (code) => {
        console.log(`[Orchestrator] Recorder ${cam.id} exited with code ${code}`);
        delete RECORDERS[cam.id];
        // Close DB to be safe
        if (DB_CONNS[cam.id]) {
            DB_CONNS[cam.id].close();
            delete DB_CONNS[cam.id];
        }
    });

    proc.on("error", (err) => {
        console.error(`[Orchestrator] Recorder ${cam.id} Error:`, err);
        delete RECORDERS[cam.id];
    });
}

function sync() {
    if (isSyncing) return;
    isSyncing = true;

    try {
        const cameras = loadCameras();
        const enabledCams = new Set();

        cameras.forEach(cam => {
            const isEnabled = cam.enabled !== false;
            if (isEnabled && (cam.record || cam.recordingMode === 'continuous')) {
                enabledCams.add(cam.id);
                const rtspUrl = `rtsp://127.0.0.1:8554/${cam.id}_hd`;
                if (!RECORDERS[cam.id]) {
                    startRecorder(cam, rtspUrl);
                }
            }
        });

        // Cleanup disabled recorders
        Object.keys(RECORDERS).forEach(id => {
            if (!enabledCams.has(id)) {
                console.log(`[Orchestrator] Stopping disabled camera ${id}`);
                RECORDERS[id].kill("SIGTERM");
                delete RECORDERS[id];
            }
        });

        // Health check: restart stuck recorders (no output for 60s)
        const now = Date.now();
        Object.keys(RECORDERS).forEach(id => {
            if (now - lastWriteAt[id] > 60000) {
                console.warn(`[Orchestrator] Camera ${id} STUCK (no segments). Restarting...`);
                RECORDERS[id].kill("SIGKILL");
                delete RECORDERS[id];
            }
        });

    } catch (e) {
        console.error("[Orchestrator] Sync Error:", e);
    } finally {
        isSyncing = false;
    }
}

// Global Cleanup
process.on('SIGTERM', () => {
    Object.values(RECORDERS).forEach(p => p.kill());
    process.exit(0);
});

// Run Sync
console.log("[Orchestrator] Started.");
setInterval(sync, 10000);
sync();

// --- GHOST KILLER: THE SAFETY NET ---
const { exec } = require('child_process');
function killGhosts() {
    exec("ps aux | grep '/opt/dss-edge/recorder_cpp/build/recorder'", (err, stdout, stderr) => {
        if (err || !stdout) return;

        const lines = stdout.split('\n');
        const runningPids = new Set();

        // 1. Identify all running recorder processes
        lines.forEach(line => {
            if (line.includes('grep')) return;
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[1]);
            if (pid) runningPids.add(pid);
        });

        // 2. terminate known children (just to be safe, though RECORDERS map is truth)
        // Actually, we want to kill PIDs that are NOT in our RECORDERS map.

        const knownPids = new Set();
        Object.values(RECORDERS).forEach(proc => {
            if (proc && proc.pid) knownPids.add(proc.pid);
        });

        // 3. Kill Unknowns
        runningPids.forEach(pid => {
            if (!knownPids.has(pid)) {
                console.warn(`[Orchestrator] 👻 GHOST FOUND: PID ${pid}. Killing it...`);
                try { process.kill(pid, 'SIGKILL'); } catch (e) { }
            }
        });
    });
}
// Run Ghost Killer every 30s
setInterval(killGhosts, 30000);

// Periodic Retention Trigger
const retention = require("../retention/retention_engine");
setInterval(() => {
    retention.retentionRun().catch(err => console.error("[Retention] Error:", err));
}, 10 * 60 * 1000);
retention.retentionRun();
