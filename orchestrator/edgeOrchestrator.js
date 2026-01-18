const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const Redis = require("ioredis");
const redis = new Redis();

// EXEC-30: Service Registry Integration
const { getRegistry } = require("../lib/ServiceRegistry");
const registry = getRegistry();


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

// EXEC-34: FAIL-FAST AUTHORITY SYSTEM
const EXEC34 = {
    systemState: 'INITIALIZING', // INITIALIZING | OPERATIONAL | DEGRADED | CRITICAL_FAIL
    lastCertification: 0,
    criticalFailures: [],
    recorderStopped: false
};

/**
 * EXEC-34 Step 1: CAMERA_READY Gate Check
 * Returns true only if camera has functional proof
 */
async function isCameraReady(camId) {
    try {
        const status = await redis.hget('recorder:cam_status', camId);
        return status === 'RECORDING';
    } catch (e) {
        return false;
    }
}

/**
 * EXEC-34 Step 3: Supervisor Authority - Validate Functional Proofs
 * Runs every 10s and emits CRITICAL_FAIL if thresholds breached
 */
async function supervisorAuthority() {
    const failures = [];

    try {
        // 1. Check Recorder Functional Proof
        const recorderProof = await redis.get('recorder:functional_proof');
        if (recorderProof) {
            const proof = JSON.parse(recorderProof);
            const age = Date.now() - proof.timestamp;

            // Recorder heartbeat stale (>15s)
            if (age > 15000) {
                failures.push({ module: 'recorder', reason: 'HEARTBEAT_STALE', age });
            }

            // No active writers but cameras configured
            if (proof.total_cameras > 0 && proof.active_writers === 0 && proof.suspended === 0) {
                failures.push({ module: 'recorder', reason: 'NO_ACTIVE_WRITERS' });
            }
        } else {
            failures.push({ module: 'recorder', reason: 'NO_PROOF_DATA' });
        }

        // 2. Check Arming Service
        const armingHb = await redis.get('hb:arming');
        if (!armingHb || Date.now() - parseInt(armingHb) > 15000) {
            failures.push({ module: 'arming', reason: 'HEARTBEAT_STALE' });
        }

        // 3. Check Go2RTC (via cached streams)
        const go2rtcTs = cachedStreams.timestamp;
        if (Date.now() - go2rtcTs > 30000 && loadedCameras.length > 0) {
            failures.push({ module: 'go2rtc', reason: 'NO_STREAM_DATA' });
        }

    } catch (e) {
        failures.push({ module: 'supervisor', reason: 'CHECK_ERROR', error: e.message });
    }

    // Update State
    EXEC34.criticalFailures = failures;

    if (failures.length > 0) {
        const criticalModules = failures.filter(f => ['recorder', 'arming'].includes(f.module));
        if (criticalModules.length > 0) {
            log(`[EXEC-34] CRITICAL FAIL DETECTED: ${JSON.stringify(criticalModules)}`);
            EXEC34.systemState = 'CRITICAL_FAIL';

            // Emit FAIL event via Redis
            redis.publish('exec34:critical_fail', JSON.stringify({
                timestamp: Date.now(),
                failures: criticalModules
            }));

            // Step 4: Fail-Fast - Stop Recorder if critical
            if (!EXEC34.recorderStopped && recorderProcess) {
                log('[EXEC-34] FAIL-FAST: Stopping Recorder due to CRITICAL_FAIL');
                recorderProcess.kill('SIGTERM');
                EXEC34.recorderStopped = true;
            }
        } else {
            EXEC34.systemState = 'DEGRADED';
        }
    } else {
        EXEC34.systemState = 'OPERATIONAL';
        EXEC34.recorderStopped = false;
    }

    // Publish System State
    await redis.set('exec34:system_state', JSON.stringify({
        state: EXEC34.systemState,
        failures: EXEC34.criticalFailures,
        timestamp: Date.now()
    }));
}

/**
 * EXEC-34 Step 5: Global NVR Certification Gate
 * System is OPERATIONAL only if all proofs pass
 */
async function certifyNVR() {
    try {
        const recorderProof = await redis.get('recorder:functional_proof');
        if (!recorderProof) {
            return { certified: false, reason: 'NO_RECORDER_PROOF' };
        }

        const proof = JSON.parse(recorderProof);

        // Rule 5.1: Recorder must be writing
        if (proof.active_writers === 0 && proof.total_cameras > 0) {
            return { certified: false, reason: 'RECORDER_NOT_WRITING' };
        }

        // Rule 5.1: No critical failures
        if (EXEC34.criticalFailures.length > 0) {
            return { certified: false, reason: 'CRITICAL_FAILURES_PRESENT' };
        }

        // All cameras must be READY or explicitly FAILED
        const camStatuses = await redis.hgetall('recorder:cam_status');
        const unknownCams = loadedCameras.filter(c =>
            c.enabled !== false &&
            !camStatuses[c.id] // No status = UNKNOWN
        );

        if (unknownCams.length > 0) {
            return { certified: false, reason: 'UNKNOWN_CAMERA_STATES', count: unknownCams.length };
        }

        EXEC34.lastCertification = Date.now();
        return { certified: true, activeWriters: proof.active_writers };

    } catch (e) {
        return { certified: false, reason: 'CERTIFICATION_ERROR', error: e.message };
    }
}

/**
 * EXEC-34 Step 4: Recovery Gate
 * Recorder can only restart if recovery proof exists
 */
async function canRecoverRecorder() {
    // Wait for at least one camera to be READY (via probe)
    const camStatuses = await redis.hgetall('recorder:cam_status');
    const readyCams = Object.values(camStatuses).filter(s => s === 'RECORDING' || s === 'FAIL_FAST_SUSPENDED');

    // At least one camera must be in a known state
    return readyCams.length > 0 || loadedCameras.length === 0;
}

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
/**
 * 4. CRITICAL RETENTION CONTROL
 * Delegates to retention_engine.js
 * Mode: "normal" | "aggressive"
 */
function runRetention(mode = "normal") {
    try {
        const retention = require('../retention/retention_engine');
        log(`Executing retention cleanup (Mode: ${mode}) per Supervisor order.`);
        retention.retentionRun(mode);
    } catch (e) {
        log("Retention error: " + e.message);
    }
}

// Subscribe to Supervisor Commands
const sub = new Redis();
sub.subscribe("state:retention:trigger", (err, count) => {
    if (!err) log("Subscribed to retention commands.");
});
sub.on("message", (channel, message) => {
    if (channel === "state:retention:trigger") {
        runRetention(message);
    }
});

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
/**
 * 6. STORAGE INDEXER
 */
function startIndexer() {
    log("Starting Storage Indexer (via Registry)...");
    /* EXEC-30: Use Registry */
    const p = registry.safeSpawn('storage_indexer');
    if (p) {
        p.on('exit', () => setTimeout(startIndexer, 10000));
    }
}

/**
 * 6.5 ARMING SERVICE
 */
function startArmingService() {
    log("Starting Arming Service (via Registry)...");
    /* EXEC-30: Use Registry */
    const p = registry.safeSpawn('arming_service', { stdio: 'inherit' });
    if (p) {
        p.on('exit', () => setTimeout(startArmingService, 5000));
    }
}

/**
 * 6.6 AI REQUEST SERVICE
 */
function startAIRequestService() {
    log("Starting AI Request Service (via Registry)...");
    /* EXEC-30: Use Registry */
    const p = registry.safeSpawn('ai_request_service', { stdio: 'inherit' });
    if (p) {
        p.on('exit', () => setTimeout(startAIRequestService, 5000));
    }
}

/**
 * 6.5 RECORDER V2 (ENTERPRISE RECORDING ENGINE)
 */
let recorderProcess = null;
let recorderRestartCount = 0;

function startRecorder() {
    log("Starting Recorder V2 (via Registry)...");

    /* EXEC-30: Use Registry */
    recorderProcess = registry.safeSpawn('recorder_v2', {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
    });

    if (!recorderProcess) {
        log("CRITICAL: Failed to spawn recorder via registry. Retrying in 5s...");
        setTimeout(startRecorder, 5000);
        return;
    }

    recorderProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg.includes('[RECORDER-V2]') || msg.includes('Recording')) {
            console.log(`[RECORDER] ${msg}`);
        }
    });

    recorderProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        // Filter out camera connection errors (expected for offline cameras)
        if (!msg.includes('No route to host') &&
            !msg.includes('Connection refused') &&
            !msg.includes('Server returned 4')) {
            console.error(`[RECORDER] ${msg}`);
        }
    });

    recorderProcess.on('exit', async (code, signal) => {
        recorderRestartCount++;
        log(`Recorder exited (code: ${code}, signal: ${signal}). Restart #${recorderRestartCount}`);

        // EXEC-34 Step 4: Recovery Gate - Check before restart
        const canRecover = await canRecoverRecorder();
        if (canRecover && !EXEC34.recorderStopped) {
            log('[EXEC-34] Recovery Gate PASSED. Restarting Recorder...');
            setTimeout(startRecorder, 10000);
        } else {
            log('[EXEC-34] Recovery Gate BLOCKED. Waiting for explicit recovery proof...');
            // Will be restarted by supervisorAuthority when state clears
            setTimeout(async () => {
                if (await canRecoverRecorder() && !EXEC34.recorderStopped) {
                    startRecorder();
                }
            }, 30000);
        }
    });

    recorderProcess.on('error', (err) => {
        log(`Recorder spawn error: ${err.message}`);
    });
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
function writePid() {
    try {
        const pidDir = "/run/dss";
        if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });
        fs.writeFileSync(path.join(pidDir, "orchestrator.pid"), process.pid.toString());
    } catch (e) {
        log("PID Write Error: " + e.message);
    }
}

function init() {
    writePid();
    log("Initializing DSS Edge Orchestrator (EXEC-34 ENFORCED)...");
    applyPriorities();
    generateGo2RTC();
    startIndexer();
    startRecorder();
    startArmingService();
    startAIRequestService();

    // setInterval(runRetention, 30000); // MOVED TO SUPERVISOR (AUTHORITY)
    setInterval(runSystemChecks, 15000);
    setInterval(updateProcesses, 15000); // 15s check
    setInterval(applyPriorities, 60000);
    setInterval(cleanupOrphanFFmpeg, 60000); // 60s orphan cleanup

    // EXEC-34: Supervisor Authority Loop (Step 3)
    setInterval(supervisorAuthority, 10000);

    // EXEC-34: NVR Certification Loop (Step 5)
    setInterval(async () => {
        const cert = await certifyNVR();
        if (!cert.certified) {
            log(`[EXEC-34] NVR NOT CERTIFIED: ${cert.reason}`);
        }
        redis.set('exec34:nvr_certification', JSON.stringify(cert));
    }, 30000);

    // Heartbeats
    setInterval(() => {
        const now = Date.now();
        ["hb:recorder", "hb:live", "hb:indexer", "hb:retention", "hb:arming", "hb:ai_request"].forEach(k => redis.set(k, now));

        // Supervisor Heartbeat (File-based)
        try { fs.writeFileSync("/tmp/dss-orchestrator.hb", now.toString()); } catch (e) { }
    }, 2000);

    // Initial Delay to let Go2RTC start
    setTimeout(updateProcesses, 5000);

    // EXEC-34: Initial Authority Check after 15s
    setTimeout(supervisorAuthority, 15000);
}

fs.watchFile(CONFIG_CAMERAS, () => {
    log("Config changed. Regenerating...");
    generateGo2RTC();
    setTimeout(updateProcesses, 2000);
});

init();
