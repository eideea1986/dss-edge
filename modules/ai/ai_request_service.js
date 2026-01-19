const Redis = require('ioredis');
const http = require('http');
const fs = require('fs');

// CONFIG
const CONFIG = {
    REDIS_RAW_CHANNEL: "events:raw",       // Input: raw motion/AI triggers
    REDIS_ARMED_CHANNEL: "events:armed",   // Input: only armed events
    REDIS_ANALYZED_CHANNEL: "events:analyzed",
    HTTP_PORT: 9201,
    MAX_QUEUE_SIZE: 100,
    FRAME_PROOF_MAX_AGE: 15000,  // 15s max frame age
    MIN_FPS: 1
};

// STATE
const queue = [];
let processing = false;

// EXEC-35: MOTION STATE
const MOTION_STATE = {
    status: 'INITIALIZING', // ACTIVE | SUSPENDED | DEGRADED | FAILED
    activeCameras: new Set(),
    lastTransition: Date.now(),
    eventsGenerated: 0,
    eventsDropped: 0
};

// REDIS
const redis = new Redis();
const redisSub = new Redis();
const redisPub = new Redis();

// LOGGING
function log(msg) {
    console.log(`[AI-REQUEST] ${msg}`);
}

function logTransition(from, to, reason) {
    log(`[EXEC-35] State Transition: ${from} -> ${to} (${reason})`);
    MOTION_STATE.status = to;
    MOTION_STATE.lastTransition = Date.now();

    // Publish state change
    redisPub.set('motion:state', JSON.stringify({
        status: to,
        reason,
        timestamp: Date.now(),
        activeCameras: Array.from(MOTION_STATE.activeCameras)
    }));
}

/**
 * EXEC-35 Step 1: Check if camera is READY (frame-proofed + armed)
 */
async function isCameraGated(camId) {
    try {
        // 1. Check ARMED state
        const armingState = await redis.get('state:arming');
        if (!armingState) return { pass: false, reason: 'NO_ARMING_STATE' };

        const arming = JSON.parse(armingState);
        if (!arming.armed) {
            return { pass: false, reason: 'SYSTEM_DISARMED' };
        }

        // 2. Check CAMERA_READY (recorder status)
        const camStatus = await redis.hget('recorder:cam_status', camId);
        if (camStatus !== 'RECORDING') {
            return { pass: false, reason: 'CAMERA_NOT_READY' };
        }

        // 3. Check Frame Proof (last write timestamp)
        const lastWrite = await redis.hget('recorder:last_write', camId);
        if (!lastWrite) {
            return { pass: false, reason: 'NO_FRAME_PROOF' };
        }

        const age = Date.now() - parseInt(lastWrite);
        if (age > CONFIG.FRAME_PROOF_MAX_AGE) {
            return { pass: false, reason: 'FRAME_STALE' };
        }

        return { pass: true };

    } catch (e) {
        return { pass: false, reason: 'GATE_CHECK_ERROR' };
    }
}

/**
 * EXEC-35 Step 3: Check zone validity
 */
async function hasValidZones(camId) {
    try {
        const configPath = '/opt/dss-edge/config/cameras.json';
        if (!fs.existsSync(configPath)) return true; // Fallback: allow full-frame

        const cams = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const cam = cams.find(c => c.id === camId);

        if (!cam) return false;

        const zones = cam.ai_server?.zones || [];
        return zones.length > 0;

    } catch (e) {
        return true; // Fallback: allow processing
    }
}

// EXEC-36: HARD STOP FLAG
let motionHardStopped = false;

// SUBSCRIBE to armed events only
redisSub.subscribe(CONFIG.REDIS_ARMED_CHANNEL, 'exec34:critical_fail', (err) => {
    if (err) log(`Failed to subscribe: ${err.message}`);
    else {
        log(`Listening for armed events on ${CONFIG.REDIS_ARMED_CHANNEL}`);
        logTransition('INITIALIZING', 'ACTIVE', 'Subscribed to armed channel');
    }
});

// EXEC-36: Subscribe to arming state changes for HARD STOP
const armingSub = new Redis();
armingSub.subscribe('ARMING_STATE_CHANGED', (err) => {
    if (!err) log('[EXEC-36] Subscribed to arming state changes');
});

armingSub.on('message', (channel, message) => {
    if (channel === 'ARMING_STATE_CHANGED') {
        try {
            const data = JSON.parse(message);
            if (data.armed === false) {
                // EXEC-36 Step 1: HARD STOP
                log('[EXEC-36] HARD STOP: System disarmed - stopping all motion processing');
                motionHardStopped = true;
                MOTION_STATE.activeCameras.clear();
                queue.length = 0; // Clear queue
                logTransition(MOTION_STATE.status, 'SUSPENDED', 'HARD_STOP_DISARM');
            } else {
                // EXEC-36 Step 1.2: Re-enable processing on arm
                log('[EXEC-36] Motion re-enabled: System armed');
                motionHardStopped = false;
                logTransition(MOTION_STATE.status, 'ACTIVE', 'SYSTEM_ARMED');
            }
        } catch (e) { }
    }
});

redisSub.on("message", async (channel, message) => {
    if (channel === CONFIG.REDIS_ARMED_CHANNEL) {
        // EXEC-36: Block processing if hard stopped
        if (motionHardStopped) {
            MOTION_STATE.eventsDropped++;
            return;
        }
        await enqueueForAnalysis(message);
    }

    // EXEC-36: Handle critical fail events
    if (channel === 'exec34:critical_fail') {
        log('[EXEC-36] Received CRITICAL_FAIL event - suspending motion');
        motionHardStopped = true;
        logTransition(MOTION_STATE.status, 'SUSPENDED', 'CRITICAL_FAIL');
    }
});

async function enqueueForAnalysis(msgStr) {
    if (queue.length >= CONFIG.MAX_QUEUE_SIZE) {
        log("Queue full! Dropping request.");
        MOTION_STATE.eventsDropped++;
        return;
    }

    try {
        const evt = JSON.parse(msgStr);
        const camId = evt.cameraId;

        // EXEC-35 Step 1 & 2: GATE CHECK
        const gate = await isCameraGated(camId);
        if (!gate.pass) {
            // EXEC-35 Step 2: Immediate suspension
            if (MOTION_STATE.activeCameras.has(camId)) {
                MOTION_STATE.activeCameras.delete(camId);
                log(`[EXEC-35] Motion SUSPENDED for ${camId}: ${gate.reason}`);
            }
            MOTION_STATE.eventsDropped++;
            return;
        }

        // EXEC-35 Step 3: Zone check
        const hasZones = await hasValidZones(camId);
        if (!hasZones) {
            log(`[EXEC-35] Motion BLOCKED for ${camId}: NO_VALID_ZONES`);
            MOTION_STATE.eventsDropped++;
            return;
        }

        // Mark camera as active for motion
        MOTION_STATE.activeCameras.add(camId);

        queue.push(evt);
        processQueue();

    } catch (e) {
        MOTION_STATE.eventsDropped++;
    }
}

async function processQueue() {
    if (processing) return;
    if (queue.length === 0) return;

    processing = true;
    const evt = queue.shift();

    try {
        // Re-validate gate before processing (double-check)
        const gate = await isCameraGated(evt.cameraId);
        if (!gate.pass) {
            log(`[EXEC-35] Processing ABORTED for ${evt.cameraId}: ${gate.reason}`);
            processing = false;
            if (queue.length > 0) setTimeout(processQueue, 10);
            return;
        }

        // MOCK AI PROCESSING
        await new Promise(r => setTimeout(r, 100));

        evt.ai_result = "person_detected";
        evt.confidence = 0.95;
        evt.timestamp_analyzed = Date.now();

        log(`AI Analysis Complete: ${evt.cameraId} -> ${evt.ai_result}`);
        MOTION_STATE.eventsGenerated++;

        // EXEC-35 Step 6: Emit only if still armed
        const armingState = await redis.get('state:arming');
        if (armingState) {
            const arming = JSON.parse(armingState);
            if (arming.armed) {
                redisPub.publish(CONFIG.REDIS_ANALYZED_CHANNEL, JSON.stringify(evt));
            } else {
                log(`[EXEC-35] Event SUPPRESSED (disarmed during processing)`);
            }
        }

    } catch (e) {
        log(`AI Processing Error: ${e.message}`);
    } finally {
        processing = false;
        if (queue.length > 0) setTimeout(processQueue, 10);
    }
}

// EXEC-35 Step 4: Supervisor Certification Loop
setInterval(async () => {
    try {
        const armingState = await redis.get('state:arming');
        const isArmed = armingState ? JSON.parse(armingState).armed : false;

        // Violation check: Motion active while disarmed
        if (!isArmed && MOTION_STATE.activeCameras.size > 0) {
            logTransition(MOTION_STATE.status, 'FAILED', 'MOTION_ACTIVE_WHILE_DISARMED');
            MOTION_STATE.activeCameras.clear();
            queue.length = 0; // Clear queue
        }

        // Normal state determination
        if (!isArmed) {
            if (MOTION_STATE.status !== 'SUSPENDED') {
                logTransition(MOTION_STATE.status, 'SUSPENDED', 'SYSTEM_DISARMED');
            }
        } else {
            if (MOTION_STATE.status === 'SUSPENDED') {
                logTransition(MOTION_STATE.status, 'ACTIVE', 'SYSTEM_ARMED');
            }
        }

        // Publish certification
        await redis.set('motion:functional_proof', JSON.stringify({
            status: MOTION_STATE.status,
            activeCameras: Array.from(MOTION_STATE.activeCameras),
            eventsGenerated: MOTION_STATE.eventsGenerated,
            eventsDropped: MOTION_STATE.eventsDropped,
            queueLength: queue.length,
            timestamp: Date.now()
        }));

    } catch (e) {
        logTransition(MOTION_STATE.status, 'DEGRADED', `CHECK_ERROR: ${e.message}`);
    }
}, 5000);

// HTTP API (Health)
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/status' || req.url === '/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: MOTION_STATE.status,
            queue_length: queue.length,
            active_cameras: Array.from(MOTION_STATE.activeCameras),
            events_generated: MOTION_STATE.eventsGenerated,
            events_dropped: MOTION_STATE.eventsDropped,
            backend: "EXEC-35_GATED"
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(CONFIG.HTTP_PORT, () => {
    log(`AI Request Service running on port ${CONFIG.HTTP_PORT} (EXEC-35 ENFORCED)`);
});

// Heartbeat
setInterval(() => {
    redisPub.set("hb:ai_request", Date.now());
}, 2000);
