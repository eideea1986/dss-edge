const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const Redis = require("ioredis");
const redis = new Redis();

// PATHS
const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_CAMERAS = path.join(ROOT_DIR, "config/cameras.json");
const GO2RTC_CONFIG = path.join(ROOT_DIR, "go2rtc.yaml");
const SNAPSHOT_DIR = path.join(ROOT_DIR, "recorder/ramdisk/snapshots");

// ENSURE DIRS
if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

// LOGGING
function log(msg) {
    console.log(`[${new Date().toISOString()}] [ORCH] ${msg}`);
}

// STATE
let loadedCameras = [];
let decoders = new Map(); // camId -> Process (Snapshot)
let recorders = new Map(); // camId -> Process (Continuous Recording)
let cachedStreams = { data: {}, timestamp: 0 };

/**
 * Helper to check if a stream is actually available in Go2RTC
 * Prevents 404 Crash Loops
 */
function checkStreamAvailability(streamName, callback) {
    const now = Date.now();
    // Cache for 2 seconds to reduce API load
    if (now - cachedStreams.timestamp < 2000) {
        return callback(!!cachedStreams.data[streamName]);
    }

    exec("curl -s http://127.0.0.1:1984/api/streams", (err, stdout) => {
        if (err || !stdout) {
            callback(false);
            return;
        }
        try {
            const data = JSON.parse(stdout);
            cachedStreams.data = data;
            cachedStreams.timestamp = now;
            callback(!!data[streamName]);
        } catch (e) {
            callback(false);
        }
    });
}

/**
 * 1. GENERATE GO2RTC CONFIG
 * Treats cameras as enabled by default.
 */
function generateGo2RTC() {
    try {
        if (!fs.existsSync(CONFIG_CAMERAS)) return;
        const cams = JSON.parse(fs.readFileSync(CONFIG_CAMERAS, 'utf8'));
        loadedCameras = cams;

        const streams = {};
        cams.forEach(cam => {
            if (cam.enabled === false) return;

            // Logic: Root ID = Best Quality Available
            let hasMain = false;
            const mainUrl = cam.rtspMain || cam.streams?.main;
            const subUrl = cam.rtspSub || cam.streams?.sub;

            if (mainUrl) {
                streams[`${cam.id}_hd`] = mainUrl;
                streams[cam.id] = mainUrl; // Default to HD
                hasMain = true;
            }
            if (subUrl) {
                streams[`${cam.id}_sub`] = subUrl;
                if (!hasMain) streams[cam.id] = subUrl; // Fallback to SD
            }
        });

        let yamlStr = "api:\n  listen: \":1984\"\n  origin: \"*\"\n\nrtsp:\n  listen: \":8554\"\n\nwebrtc:\n  listen: \":8555\"\n  candidates:\n    - 192.168.120.208\n    - 127.0.0.1\n\nstreams:\n";
        for (const [key, val] of Object.entries(streams)) {
            if (Array.isArray(val)) {
                yamlStr += `  ${key}:\n`;
                val.forEach(v => yamlStr += `    - "${v}"\n`);
            } else {
                yamlStr += `  ${key}: "${val}"\n`;
            }
        }
        // Save
        fs.writeFileSync(GO2RTC_CONFIG, yamlStr);
        log("Generated go2rtc.yaml");
        // Reload Go2RTC
        exec("systemctl restart dss-go2rtc", (err) => {
            if (err) log("Failed to restart Go2RTC: " + err.message);
            else log("Restarted Go2RTC.");
        });
    } catch (e) {
        log("Error generating Go2RTC config: " + e.message);
    }
}

/**
 * 2. MANAGE PROCESSES (Decoders & Recorders)
 * Incorporates Disk Pressure Throttling.
 */
function updateProcesses() {
    exec(`df -P ${path.join(ROOT_DIR, 'storage')} | tail -1`, (err, stdout) => {
        let blockRecording = false;
        let onlyAI = false;

        if (!err && stdout) {
            const used = parseInt(stdout.trim().split(/\s+/)[4].replace("%", ""));
            if (used >= 94) blockRecording = true; // HARD STOP for normal cams
            else if (used >= 90) onlyAI = true;     // SOFT THROTTLE
        }

        // Determine active IDs based on enabled flag and disk pressure
        const activeIds = loadedCameras.filter(c => {
            if (c.enabled === false) return false;
            if (blockRecording && !c.ai) return false;
            if (onlyAI && !c.ai) return false;
            return true;
        }).map(c => c.id);

        // --- SNAPSHOT DECODERS ---
        // Stop decoders no longer needed
        for (const [id, proc] of decoders) {
            if (!activeIds.includes(id)) {
                log(`Stopping Decoder for ${id}`);
                proc.kill('SIGKILL');
                decoders.delete(id);
            }
        }
        // Start missing decoders (Software fallback active)
        loadedCameras.forEach(cam => {
            if (cam.enabled === false || decoders.has(cam.id)) return;
            const mainUrl = cam.rtspMain || cam.streams?.main;
            const subUrl = cam.rtspSub || cam.streams?.sub;
            if (!mainUrl && !subUrl) return;

            let streamSuffix = "";
            if (subUrl) streamSuffix = "_sub";
            const rtspUrl = `rtsp://127.0.0.1:8554/${cam.id}${streamSuffix}`;
            // Verify stream exists in Go2RTC first to avoid 404 crash loop
            checkStreamAvailability(`${cam.id}${streamSuffix}`, (isAvailable) => {
                if (!isAvailable) {
                    // log(`Skipping Decoder for ${cam.id} - Stream not available in Go2RTC`);
                    return;
                }

                log(`Starting Snapshot Decoder for ${cam.id}...`);

                const args = [
                    '-hide_banner', '-y', '-loglevel', 'error',
                    '-skip_frame', 'nokey',
                    '-rtsp_transport', 'tcp',
                    '-i', rtspUrl,
                    '-threads', '1',
                    '-vf', 'fps=0.2,scale=640:360',
                    '-update', '1',
                    path.join(SNAPSHOT_DIR, `${cam.id}.jpg`)
                ];

                const p = spawn('nice', ['-n', '19', 'ffmpeg', ...args]);

                let stderrLog = "";
                p.stderr.on('data', (d) => {
                    stderrLog += d.toString();
                    if (stderrLog.length > 500) stderrLog = stderrLog.slice(-500);
                });

                p.on('exit', (code) => {
                    if (code !== 0 && code !== 255) log(`Decoder ${cam.id} CRASHED (code ${code}). Stderr: ${stderrLog.slice(-100)}`);
                    decoders.delete(cam.id);
                });
                decoders.set(cam.id, p);
            });
        });

        // --- CONTINUOUS RECORDERS ---
        // Stop recorders no longer needed (including throttled ones)
        for (const [id, proc] of recorders) {
            if (!activeIds.includes(id)) {
                log(`Stopping Recorder for ${id} (Reason: ${blockRecording ? 'Disk Critical' : 'Disabled/Throttled'})`);
                proc.kill('SIGTERM');
                recorders.delete(id);
            }
        }
        // Start missing recorders
        loadedCameras.forEach(cam => {
            if (cam.enabled === false) return;
            if (blockRecording && !cam.ai) return;
            if (onlyAI && !cam.ai) return;
            if (recorders.has(cam.id)) return;
            const mainUrl = cam.rtspMain || cam.streams?.main;
            const subUrl = cam.rtspSub || cam.streams?.sub;
            if (!mainUrl && !subUrl) return;

            const rtspUrl = `rtsp://127.0.0.1:8554/${cam.id}`; // Default to Best Quality (Main if available)

            // Verify stream exists in Go2RTC first
            checkStreamAvailability(cam.id, (isAvailable) => {
                if (!isAvailable) return;

                log(`Starting Recorder for ${cam.id}...`);

                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');

                const dayDir = path.join(ROOT_DIR, 'storage', cam.id, String(y), m, d);
                if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

                const args = [
                    '-hide_banner', '-y', '-loglevel', 'error',
                    '-rtsp_transport', 'tcp',
                    '-i', rtspUrl,
                    '-map', '0', '-c', 'copy',
                    '-f', 'segment',
                    '-segment_time', '60',
                    '-strftime', '1',
                    '-reset_timestamps', '1',
                    path.join(dayDir, '%H-%M-%S.mp4')
                ];

                const p = spawn('ffmpeg', args);

                let stderrLog = "";
                p.stderr.on('data', (d) => {
                    stderrLog += d.toString();
                    if (stderrLog.length > 500) stderrLog = stderrLog.slice(-500);
                });

                p.on('exit', (code) => {
                    if (code !== 0) log(`Recorder ${cam.id} CRASHED (code ${code}). Stderr: ${stderrLog}`);
                    else log(`Recorder ${cam.id} exited cleanly.`);
                    recorders.delete(cam.id);
                });
                recorders.set(cam.id, p);
            });
        });
    });
}

/**
 * 3. SMART CPU SCHEDULING
 */
function applyPriorities() {
    log("Applying Smart CPU Priorities...");
    const setHigh = (pid) => exec(`renice -n -10 -p ${pid}`);

    setHigh(process.pid); // Self
    exec('pgrep -f "dss-edge-api"', (e, stdout) => {
        if (stdout) stdout.trim().split('\n').forEach(pid => setHigh(pid));
    });
    exec('pgrep redis-server', (e, stdout) => {
        if (stdout) stdout.trim().split('\n').forEach(pid => setHigh(pid));
    });
}

/**
 * 4. CRITICAL RETENTION CONTROL
 * High-throughput cleanup.
 */
function runRetention() {
    exec(`df -P ${path.join(ROOT_DIR, 'storage')} | tail -1`, (err, stdout) => {
        if (err || !stdout) return;
        const usedPercent = parseInt(stdout.trim().split(/\s+/)[4].replace("%", ""));
        redis.set("hb:disk_usage", usedPercent);

        if (usedPercent >= 85) {
            const isCritical = usedPercent >= 94;
            const batchSize = isCritical ? 1500 : 500;
            const dirCount = isCritical ? 30 : 10;

            log(`Retention started (${isCritical ? 'CRITICAL' : 'NORMAL'}: ${usedPercent}%)`);
            exec(`find ${path.join(ROOT_DIR, 'storage')} -mindepth 4 -maxdepth 4 -type d | sort | head -n ${dirCount}`, (e, out) => {
                if (!out) return;
                const dirs = out.trim().split('\n');
                let done = 0;
                dirs.forEach(d => {
                    exec(`find "${d}" -type f | sort | head -n ${batchSize} | xargs rm -f && rmdir --ignore-fail-on-non-empty "${d}"`, () => {
                        done++;
                        if (done === dirs.length && isCritical) setTimeout(runRetention, 100);
                    });
                });
            });
        }
    });
}

/**
 * 5. SYSTEM MONITORING
 */
function runSystemChecks() {
    exec("ip addr show wg0 && ip addr show wg1", (err, stdout) => {
        const wg0 = stdout.includes("wg0") && stdout.includes("UP");
        const wg1 = stdout.includes("wg1") && stdout.includes("UP");
        redis.set("state:vpn:wg0", wg0 ? "UP" : "DOWN");
        redis.set("state:vpn:wg1", wg1 ? "UP" : "DOWN");
    });
}

/**
 * 6. STORAGE INDEXER
 */
const INDEXER_PATH = path.join(ROOT_DIR, "modules/record/storage_indexer.js");
function startIndexer() {
    log("Starting Storage Indexer...");
    const p = spawn('node', [INDEXER_PATH]);
    p.on('exit', () => setTimeout(startIndexer, 10000));
}

/**
 * 7. CLEANUP ORPHAN PLAYBACK PROCESSES
 */
function cleanupOrphanFFmpeg() {
    exec("ps -eo pid,cmd | grep ffmpeg | grep -E 'probesize|analyzeduration' | grep -v grep | awk '{print $1}'", (err, stdout) => {
        if (err || !stdout.trim()) return;
        const pids = stdout.trim().split('\n');
        if (pids.length > 0) {
            log(`Killing ${pids.length} orphan playback FFmpeg processes`);
            pids.forEach(pid => {
                try { exec(`kill -9 ${pid}`); } catch (e) { }
            });
        }
    });
}

/**
 * 7. INITIALIZATION
 */
function init() {
    log("Initializing DSS Edge Orchestrator (Optimized v4)...");
    applyPriorities();
    generateGo2RTC();
    startIndexer();

    setInterval(runRetention, 30000); // 30s check
    setInterval(runSystemChecks, 15000);
    setInterval(updateProcesses, 15000); // 15s check
    setInterval(applyPriorities, 60000);
    setInterval(cleanupOrphanFFmpeg, 60000); // 60s orphan cleanup

    // Heartbeats
    setInterval(() => {
        const now = Date.now();
        ["hb:recorder", "hb:live", "hb:indexer", "hb:retention"].forEach(k => redis.set(k, now));
    }, 2000);

    // Initial Delay to let Go2RTC start
    setTimeout(updateProcesses, 5000);
}

fs.watchFile(CONFIG_CAMERAS, () => {
    log("Config changed. Regenerating...");
    generateGo2RTC();
    setTimeout(updateProcesses, 2000);
});

init();
