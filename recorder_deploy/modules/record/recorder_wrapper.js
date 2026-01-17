const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Redis = require('ioredis');

// Configuration
const CONFIG_PATH = "/opt/dss-edge/config/cameras.json";
const RECORDER_BIN = "/opt/dss-edge/recorder_cpp/build/recorder";
const STORAGE_PATH = "/opt/dss-edge/storage";

const redis = new Redis();
const activeRecorders = new Map(); // camId -> Process

// --- LOGIC ---
function loadCameras() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return [];
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Failed to load configs:", e);
        return [];
    }
}

function startRecorder(cam) {
    if (activeRecorders.has(cam.id)) return; // Already running

    console.log(`[REC-CORE] Starting recorder for ${cam.id} (${cam.ip})...`);

    // Ensure output dir exists
    // The C++ recorder creates dirs? Assume yes or managed by wrapper.
    // The C++ recorder writes to STORAGE_PATH directly.

    const user = cam.credentials?.user || cam.user || "admin";
    const pass = cam.credentials?.pass || cam.pass || "admin";

    const args = [
        "--camera-id", cam.id,
        "--rtsp", cam.streams?.main || cam.rtsp_main || `rtsp://${user}:${pass}@${cam.ip}:554/cam/realmonitor?channel=1&subtype=0`,
        "--out", STORAGE_PATH
    ];

    const proc = spawn(RECORDER_BIN, args, { stdio: 'ignore' }); // Ignore stdio to prevent spam

    proc.on('exit', (code) => {
        console.warn(`[REC-CORE] Recorder ${cam.id} exited (code ${code}). Restarting in 5s...`);
        activeRecorders.delete(cam.id);
        setTimeout(() => {
            // Reload cam config to see if it was deleted? 
            // For now, simple restart if still in config list (checked next cycle)
        }, 5000);
    });

    activeRecorders.set(cam.id, proc);
}

function sync() {
    const cameras = loadCameras();
    const activeIds = new Set(cameras.map(c => c.id));

    // 1. Start missing
    cameras.forEach(cam => {
        if (cam.status === 'ONLINE' || true) { // Always try to record if configured?
            startRecorder(cam);
        }
    });

    // 2. Stop removed
    for (const [id, proc] of activeRecorders) {
        if (!activeIds.has(id)) {
            console.log(`[REC-CORE] Stopping recorder for ${id} (removed from config)`);
            proc.kill();
            activeRecorders.delete(id);
        }
    }

    // Heartbeat
    redis.set("hb:recorder", Date.now());
}

// --- MAIN LOOP ---
console.log("[REC-CORE] Recorder Manager v1.0 Starting...");
setInterval(sync, 10000); // Sync every 10s
sync();

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log("[REC-CORE] Shutting down...");
    for (const proc of activeRecorders.values()) proc.kill();
    process.exit(0);
});
