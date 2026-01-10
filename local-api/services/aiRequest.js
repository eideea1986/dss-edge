/* aiRequest.js - AI Producer (Queue + Temporal Window) */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const EventEmitter = require('events');

const CAM_CONFIG_PATH = path.join(__dirname, '../../config/cameras.json');
const AI_CONFIG_PATH = path.join(__dirname, '../ai_config.json');

// Tuning Constants (Trassir style)
const MAX_CONCURRENT_REQUESTS = 2; // Protect HUB from overload
const SAMPLING_INTERVAL_MS = 1000; // Max 1 frame analysis per sec per cam
const REQUEST_TIMEOUT_MS = 3000;   // Fail fast
const HUB_DEFAULT_URL = "http://192.168.120.205:8080/api/hub/analyze";

class AIRequestManager extends EventEmitter {
    constructor() {
        super();
        this.config = { hub_url: HUB_DEFAULT_URL, active_module: "yolo", enabled: true };
        this.cameras = [];
        this.loadConfigs();

        // Queue System
        this.queue = [];
        this.activeRequests = 0;

        // State Tracking per Camera (for Temporal Window)
        this.cameraStates = new Map(); // camId -> { lastProcessedTs: number }

        // Start Queue Processor
        setInterval(() => this.processQueue(), 100);
    }

    loadConfigs() {
        try {
            if (fs.existsSync(AI_CONFIG_PATH)) {
                const loaded = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'));
                this.config = { ...this.config, ...loaded };
            }
            if (!this.config.hub_url) this.config.hub_url = HUB_DEFAULT_URL;

            if (fs.existsSync(CAM_CONFIG_PATH)) {
                this.cameras = JSON.parse(fs.readFileSync(CAM_CONFIG_PATH, 'utf8'));
            }
        } catch (e) { console.error("[AI] Config Load Error:", e.message); }
    }

    // Public Entry Point
    async handleMotion(camId) {
        this.loadConfigs();
        const cam = this.cameras.find(c => c.id === camId);
        if (!cam) return;

        // CRITICAL: Status Check
        if (cam.status !== "ONLINE" && cam.enabled !== true) {
            // Fallback to enabled if status missing, but strict preference for status
            if (cam.status && cam.status !== "ONLINE") return;
            if (!cam.status && !cam.enabled) return;
        }

        // 1. Arming Check
        const isArmed = cam.ai_server?.enabled || cam.ai || false;
        if (!isArmed) return;

        // 2. Temporal Sampling (Throttle)
        const now = Date.now();
        const camState = this.cameraStates.get(camId) || { lastProcessedTs: 0 };

        if (now - camState.lastProcessedTs < SAMPLING_INTERVAL_MS) {
            // Drop frame (sampling/debounce frame capture)
            return;
        }

        // 3. Queue Admittance
        // If queue too full, drop oldest or drop current? Drop current to behave like realtime shedder
        if (this.queue.length > 5) {
            console.warn(`[AI] Queue full (>5), dropping frame for ${camId}`);
            return;
        }

        // Add to Queue
        this.queue.push({
            camId,
            timestamp: now,
            camConfig: cam
        });

        // Update state
        camState.lastProcessedTs = now;
        this.cameraStates.set(camId, camState);
    }

    async processQueue() {
        if (this.queue.length === 0) return;
        if (this.activeRequests >= MAX_CONCURRENT_REQUESTS) return;

        const task = this.queue.shift();
        this.activeRequests++;

        try {
            await this.executeTask(task);
        } catch (e) {
            console.error(`[AI] Task Failed for ${task.camId}:`, e.message);
        } finally {
            this.activeRequests--;
            // Immediate retry for next task to fill slots
            setImmediate(() => this.processQueue());
        }
    }

    async executeTask(task) {
        const { camId, timestamp, camConfig } = task;

        // 1. Capture Snapshot (Frame)
        const tmpPath = path.join(__dirname, `../../tmp/${camId}_${timestamp}.jpg`);
        // Ensure dir
        // Instead of ffmpeg, copy from ramdisk snapshot
        const snapPath = path.join(os.tmpdir(), `ai_${Date.now()}_${camId}.jpg`);
        const ramDiskPath = path.resolve(__dirname, '../../recorder/ramdisk/snapshots', `${camId}.jpg`);

        try {
            // Check if we have a fresh snapshot from DecoderManager
            if (!fs.existsSync(ramDiskPath)) {
                throw new Error("No fresh snapshot available from Decoder");
            }

            // Fast Copy (Internal memory transfer)
            fs.copyFileSync(ramDiskPath, snapPath);
        } catch (error) {
            console.warn(`[AI] Failed to get snapshot for ${camId}: ${error.message}`);
            // If snapshot fails, we can't proceed with this task.
            return; // Exit task execution
        }

        // LIVENESS CONFIRMED: We got a real frame! (Varianta B)
        cameraStore.updateLastFrame(task.camId);

        // 2. Pre-process (Crop ROI) - Logic simplified, if needed insert crop here
        let finalPath = snapPath; // Use snapPath as the initial image for processing
        if (camConfig.ai_server?.zones?.length > 0 && camConfig.ai_server.zones[0].points) {
            const cropP = await this.cropImage(snapPath, camConfig.ai_server.zones[0]);
            if (cropP) finalPath = cropP;
        }

        // 3. Send to HUB
        const detections = await this.sendToHub(finalPath, camId);

        // 4. Emit Result (to EventManager)
        if (detections && detections.length > 0) {
            this.emit('ai_result', {
                camId,
                timestamp,
                detections,
                imagePath: finalPath,
                originalPath: tmpPath
            });

            // Draw boxes for debug/evidence (Async, don't wait)
            this.drawBoxes(finalPath, detections);
        } else {
            // No detection, clean up immediately
            fs.unlink(tmpPath, () => { });
            if (finalPath !== tmpPath) fs.unlink(finalPath, () => { });
        }
    }

    async cropImage(imagePath, zone) {
        if (!zone || !zone.points || zone.points.length === 0) return null;
        const points = zone.points;
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        const minX = Math.floor(Math.min(...xs));
        const maxX = Math.ceil(Math.max(...xs));
        const minY = Math.floor(Math.min(...ys));
        const maxY = Math.ceil(Math.max(...ys));
        const w = maxX - minX;
        const h = maxY - minY;
        if (w < 10 || h < 10) return null;

        const cropPath = imagePath + ".crop.jpg";
        return new Promise((resolve) => {
            exec(`ffmpeg -y -v quiet -i "${imagePath}" -vf "crop=${w}:${h}:${minX}:${minY}" "${cropPath}"`, (err) => {
                if (err) resolve(null);
                else resolve(cropPath);
            });
        });
    }

    async sendToHub(imagePath, camId) {
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');

            const response = await axios.post(this.config.hub_url, {
                image: base64Image,
                module: this.config.active_module || 'yolo',
                camId: camId,
                origin: "edge-208"
            }, { timeout: REQUEST_TIMEOUT_MS });

            return response.data.detections;
        } catch (e) {
            // console.error(`[AI] Hub/Network Error: ${e.message}`);
            return null;
        }
    }

    drawBoxes(filePath, detections) {
        const validDets = detections.filter(d => d.bbox && d.bbox.length === 4);
        if (validDets.length === 0) return;

        let filters = validDets.map(d => {
            let [x1, y1, x2, y2] = d.bbox;
            let w = x2 - x1;
            let h = y2 - y1;
            return `drawbox=x=${Math.round(x1)}:y=${Math.round(y1)}:w=${Math.round(w)}:h=${Math.round(h)}:color=red@1.0:t=3`;
        }).join(',');

        const tmpPath = filePath + ".box.jpg";
        exec(`ffmpeg -v quiet -y -i "${filePath}" -vf "${filters}" "${tmpPath}" && mv "${tmpPath}" "${filePath}"`, (err) => {
            // Done
        });
    }
}

module.exports = new AIRequestManager();
