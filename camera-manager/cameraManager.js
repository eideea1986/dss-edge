const http = require('http');

// --- SEGMENTED ARCHITECTURE (V2) ---
const streamProc = require('./src/StreamProcessor');    // LIVE / MJPEG / FRAME INGEST
const streamProc = require('./src/StreamProcessor');    // LIVE / MJPEG / FRAME INGEST
// const recorder = require('./src/Recorder');           // RECORDING (MKV STORAGE) - DEPRECATED
const intel = require('./src/IntelligenceEngine'); // MOTION / AI ANALYSIS
const security = require('./src/SecurityManager');     // ARMING LOGIC
const comms = require('./src/CommunicationManager');// EVENT DISPATCHING (Cloud/UI)
const deviceMgr = require('./src/DeviceManager');      // CAMERA PROVISIONING / CONFIG
const health = require('./src/HealthMonitor');       // CHANNEL STATUS / METRICS
const db = require('./src/Database');           // INDEXING ENGINE
// const retention = require('./src/RetentionManager');    // STORAGE MANAGEMENT - DEPRECATED (Moved to dss-recorder)

require('./aiClient'); // Incarca global.sendToAI

/**
 * MAIN ORCHESTRATOR
 * Acționează doar ca un "Lipici" (Glue) între modulele specializate.
 */
function init() {
    console.log("[Manager] Initializing Segmented NVR System...");

    // 1. Load Cameras & Provision Streams (Device Management Segment)
    cameras = deviceMgr.loadCameras();
    deviceMgr.provisionGo2RTC(cameras);
    health.setConfiguredCameras(cameras);

    // 2. Start Infrastructure (Storage / Database)
    // retention.startCleanupLoop(); // DEPRECATED

    // 3. Register Intelligence Callback
    global.broadcastAI = (camId, result) => {
        const cam = cameras.find(c => c.id === camId);
        intel.handleDetections(camId, result.detections, result.snapshot, cam?.name || camId);
    };

    // 4. Background Discovery & Patching (Self-Healing)
    const runDiscovery = async () => {
        const currentStatus = health.getGlobalStatus();
        for (const cam of cameras) {
            const status = currentStatus[cam.id];
            if (cam.enabled !== false && (!status || status.status === 'offline')) {
                const found = await deviceMgr.discoverPaths(cam.ip, cam);
                if (found) {
                    console.log(`[Manager] Self-Healed Camera: ${cam.id}`);
                    Object.assign(cam, found);
                    deviceMgr.saveCameras(cameras);
                    deviceMgr.provisionGo2RTC(cameras);
                    // Force restart processing for this camera
                    // recorder.stopRecording(cam.id);
                    // recorder.startRecording(cam);
                    streamProc.startIngest(cam);
                }
            }
        }
    };

    // Run once on startup and then every 5 minutes
    runDiscovery();
    setInterval(runDiscovery, 5 * 60 * 1000);

    // 5. Start Processing Pipelines
    const syncPipelines = () => {
        const armedStatus = {};
        cameras.forEach(cam => {
            if (cam.enabled === false) return;

            const isArmed = security.isCameraArmed(cam.id);
            armedStatus[cam.id] = isArmed;

            // Start/Stop Ingest based on ARMED state (AI only needs frames when armed)
            if (isArmed || cam.ai_forced) {
                if (!streamProc.processes[cam.id]) {
                    console.log(`[Manager] Arming Ingest for ${cam.id}`);
                    streamProc.startIngest(cam);
                }
            } else {
                if (streamProc.processes[cam.id]) {
                    console.log(`[Manager] Disarming Ingest for ${cam.id}`);
                    // streamProc.stopIngest(cam.id); // Assuming stay in memory but stop process
                    if (streamProc.processes[cam.id]) {
                        streamProc.processes[cam.id].kill('SIGKILL');
                        delete streamProc.processes[cam.id];
                    }
                }
            }
        });
    };

    // Run every 30 seconds to track schedule changes
    setInterval(syncPipelines, 30000);
    syncPipelines();

    // 6. Connect Segments via Events
    streamProc.on('frame', ({ camId, buffer }) => {
        const cam = cameras.find(c => c.id === camId);
        if (!cam) return;

        // C. Health Monitoring Segment
        health.reportPing(camId);

        // D. Intelligence / Motion Analysis Segment
        const isArmed = security.isCameraArmed(camId);
        intel.analyzeFrame(camId, buffer, cam.ai_server || {}, isArmed);
    });

    startApiGateway();
}

/**
 * API GATEWAY (Port 5002)
 * Expune funcționalitățile modulelor către UI / Local API.
 */
function startApiGateway() {
    http.createServer(async (req, res) => { // Added async
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');

        // SEGMENT: STATUS REPORTING
        if (path === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                cameras: health.getGlobalStatus(),
                retention: { active: true },
                system: { uptime: process.uptime(), memory: process.memoryUsage().rss }
            }));
        }

        // SEGMENT: MJPEG LIVE
        if (path.startsWith('/mjpeg/')) {
            const camId = path.split('/')[2];
            res.writeHead(200, {
                'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
                'Cache-Control': 'no-cache',
                'Connection': 'close',
                'Pragma': 'no-cache'
            });

            const sendFrame = (data) => {
                if (data.camId === camId) {
                    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${data.buffer.length}\r\n\r\n`);
                    res.write(data.buffer);
                    res.write('\r\n');
                }
            };

            streamProc.on('frame', sendFrame);
            res.on('close', () => streamProc.removeListener('frame', sendFrame));
            return;
        }

        // SEGMENT: SNAPSHOTS
        if (path.startsWith('/snapshot/')) {
            const camId = path.split('/')[2];
            const frame = await streamProc.getLatestFrame(camId); // Now awaited
            if (frame) {
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                return res.end(frame);
            }
            res.writeHead(404).end();
            return;
        }

        // SEGMENT: HISTORICAL EVENTS
        if (path === '/events/recent') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(comms.getRecentEvents()));
        }

        // SEGMENT: TIMELINE & PLAYBACK
        if (path.startsWith('/timeline/')) {
            const parts = path.split('/');
            // /timeline/:camId?start=...&end=...
            const camId = parts[2];
            const start = parseInt(url.searchParams.get('start')) || (Math.floor(Date.now() / 1000) - 86400);
            const end = parseInt(url.searchParams.get('end')) || Math.floor(Date.now() / 1000);

            db.querySegments(camId, start, end).then(segments => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(segments));
            }).catch(e => {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            });
            return;
        }

        res.writeHead(404).end();
    }).listen(5002, '0.0.0.0', () => {
        console.log(`[Gateway] Orchestrator online on Port 5002`);
    });
}

// Global Exception Handler to prevent service crash
process.on('uncaughtException', (err) => {
    console.error("[Manager:CRASH] Uncaught Exception:", err);
});

init();
