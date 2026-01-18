const http = require('http');

// --- SEGMENTED ARCHITECTURE (V2) ---
const streamProc = require('./src/StreamProcessor');    // LIVE / MJPEG / FRAME INGEST
const intel = require('./src/IntelligenceEngine');     // MOTION / AI ANALYSIS
const security = require('./src/SecurityManager');     // ARMING LOGIC
const comms = require('./src/CommunicationManager');    // EVENT DISPATCHING (Cloud/UI)
const deviceMgr = require('./src/DeviceManager');      // CAMERA PROVISIONING / CONFIG
const health = require('./src/HealthMonitor');       // CHANNEL STATUS / METRICS
const db = require('./src/Database');           // INDEXING ENGINE

require('./aiClient');

// ENTERPRISE CONFIG FLAGS
global.enterpriseConfig = {
    cameraEnableMode: 'vms',        // 'vms' = complete disable logic
    disconnectOnDisable: true,
    stopIngestOnDisable: true,
    refreshDeviceConfig: 'on-connect', // refresh config from ONVIF when online
    onvifWrite: true,
    onvifWriteScope: ['codec', 'resolution', 'fps', 'gop'],
    pipelineRestartOnApply: true
};

let cameras = [];

function init() {
    console.log("[Manager] Initializing Enterprise NVR System (VMS Mode)...");

    // 1. Load Cameras & Provision Streams
    cameras = deviceMgr.loadCameras();
    deviceMgr.provisionGo2RTC(cameras);
    health.setConfiguredCameras(cameras);

    // 2. Intelligence Callback
    global.broadcastAI = (camId, result) => {
        const cam = cameras.find(c => c.id === camId);
        intel.handleDetections(camId, result.detections, result.snapshot, cam?.name || camId);
    };

    // 3. ENTERPRISE: Connection Hook for Config Refresh
    setInterval(async () => {
        const currentStatus = health.getGlobalStatus();
        for (const cam of cameras) {
            const status = currentStatus[cam.id];

            // IF ONLINE AND NEVER REFRESHED (or refresh on-connect policy)
            if (status && status.connected && !cam._lastRefreshedAt) {
                if (global.enterpriseConfig.refreshDeviceConfig === 'on-connect') {
                    const success = await deviceMgr.refreshCameraConfig(cam);
                    if (success) {
                        cam._lastRefreshedAt = Date.now();
                        deviceMgr.saveCameras(cameras);
                    }
                }
            }
            if (status && !status.connected) {
                cam._lastRefreshedAt = null; // Reset for next connection
            }
        }
    }, 10000);

    // 4. Ingest & Processing Pipelines (VMS MODE)
    const syncPipelines = () => {
        cameras.forEach(cam => {
            // ENTERPRISE: VMS MODE - If disabled, kill EVERYTHING
            if (cam.enabled === false) {
                if (streamProc.processes[cam.id]) {
                    console.log(`[VMS] Killing Ingest for DISABLED camera: ${cam.id}`);
                    streamProc.processes[cam.id].kill('SIGKILL');
                    delete streamProc.processes[cam.id];
                }
                return;
            }

            const isArmed = security.isCameraArmed(cam.id);
            if (isArmed || cam.ai_forced) {
                if (!streamProc.processes[cam.id]) {
                    console.log(`[Manager] Arming Ingest for ${cam.id}`);
                    streamProc.startIngest(cam);
                }
            } else {
                if (streamProc.processes[cam.id]) {
                    console.log(`[Manager] Disarming Ingest for ${cam.id}`);
                    if (streamProc.processes[cam.id]) {
                        streamProc.processes[cam.id].kill('SIGKILL');
                        delete streamProc.processes[cam.id];
                    }
                }
            }
        });
    };

    setInterval(syncPipelines, 15000); // Faster sync for VMS mode
    syncPipelines();

    // 5. Connect Segments via Events
    streamProc.on('frame', ({ camId, buffer }) => {
        const cam = cameras.find(c => c.id === camId);
        if (!cam) return;
        health.reportPing(camId);
        const isArmed = security.isCameraArmed(camId);
        intel.analyzeFrame(camId, buffer, cam.ai_server || {}, isArmed);
    });

    startApiGateway();
}

function startApiGateway() {
    http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;
        res.setHeader('Access-Control-Allow-Origin', '*');

        // SEGMENT: STATUS
        if (path === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                cameras: health.getGlobalStatus(),
                system: { uptime: process.uptime(), memory: process.memoryUsage().rss }
            }));
        }

        // SEGMENT: APPLY CONFIG (EXPLICIT ONVIF WRITE)
        if (path === '/config/apply' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const cam = cameras.find(c => c.id === data.camId);
                    if (!cam) throw new Error("Camera not found");

                    // Update local params
                    cam.params = { ...(cam.params || {}), ...data.params };
                    deviceMgr.saveCameras(cameras);

                    // Sync to physical device
                    if (global.enterpriseConfig.onvifWrite) {
                        await deviceMgr.syncConfigToDevice(cam);
                    }

                    // Restart pipeline if needed
                    if (global.enterpriseConfig.pipelineRestartOnApply) {
                        if (streamProc.processes[cam.id]) {
                            streamProc.processes[cam.id].kill('SIGKILL');
                            delete streamProc.processes[cam.id];
                            streamProc.startIngest(cam);
                        }
                    }

                    res.writeHead(200).end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(500).end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // MJPEG
        if (path.startsWith('/mjpeg/')) {
            const camId = path.split('/')[2];
            res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame' });
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

        // SNAPSHOTS
        if (path.startsWith('/snapshot/')) {
            const camId = path.split('/')[2];
            const frame = streamProc.getLatestFrame(camId);
            if (frame) {
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                return res.end(frame);
            }
            res.writeHead(404).end();
            return;
        }

        res.writeHead(404).end();
    }).listen(5002, '0.0.0.0', () => {
        console.log(`[Gateway] Orchestrator online (Enterprise) on Port 5002`);
    });
}

process.on('uncaughtException', (err) => {
    console.error("[Manager:CRASH] Uncaught Exception:", err);
});

init();
