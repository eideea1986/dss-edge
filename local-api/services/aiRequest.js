const axios = require('axios');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const EventEmitter = require('events');
const os = require('os');
const cameraStore = require('../store/cameraStore');
const { isArmed } = require('../../camera-manager/armingLogic');
let createCanvas, loadImage;
try {
    const c = require('canvas');
    createCanvas = c.createCanvas;
    loadImage = c.loadImage;
} catch (e) {
    // console.warn("[AI] Canvas module missing (Optional).");
}

const CAM_CONFIG_PATH = path.join(__dirname, '../../config/cameras.json');
const AI_CONFIG_PATH = path.join(__dirname, '../ai_config.json');
const EDGE_CONFIG_PATH = path.join(__dirname, '../../config/edge.json');

// ENTERPRISE TUNING
const DEBOUNCE_INTERVAL_MS = 2000;
const HUB_DEFAULT_URL = "http://192.168.120.205:8080/api/hub/analyze";
const MIN_ZONE_INTERSECTION = 0.30;

class AIRequestManager extends EventEmitter {
    constructor() {
        super();
        this.config = { hub_url: HUB_DEFAULT_URL, active_module: "ai_small", enabled: true };
        this.edgeConfig = { name: "DSS-Edge", locationId: "LOC000" };
        this.cameras = [];
        this.loadConfigs();

        this.queue = [];
        this.activeRequests = 0;
        this.cameraStates = new Map(); // { lastTriggerTs, prevBuffer (for JS motion) }

        // Native Motion
        this.libMotion = null;
        this.detectors = new Map();
        this.initNativeFilter();

        setInterval(() => this.processQueue(), 100);
        setInterval(() => this.pipelineTick(), 1000);
        setInterval(() => this.loadConfigs(), 60000);
    }

    initNativeFilter() {
        try {
            const koffi = require('koffi');
            const libPath = path.join(__dirname, '../native/libmotionfilter.so');
            if (fs.existsSync(libPath)) {
                this.libMotion = koffi.load(libPath);
                this.fnCreate = this.libMotion.func('void* create_detector(int width, int height, double minAreaRatio, int minFrames, double maxStaticVariance)');
                this.fnProcess = this.libMotion.func('int process_frame_file(void* handle, const char* imagePath)');
                this.fnDestroy = this.libMotion.func('void destroy_detector(void* handle)');
                console.log("[AI] Native Motion Filter: ACTIVE");
            }
        } catch (e) {
            console.log("[AI] Native Motion Filter: UNAVAILABLE (Using Software Fallback)");
        }
    }

    loadConfigs() {
        try {
            if (fs.existsSync(AI_CONFIG_PATH)) {
                const loaded = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'));
                this.config = { ...this.config, ...loaded };
            }
            if (!this.config.hub_url || this.config.hub_url.includes("127.0.0.1")) {
                this.config.hub_url = HUB_DEFAULT_URL;
            }
            if (fs.existsSync(CAM_CONFIG_PATH)) this.cameras = JSON.parse(fs.readFileSync(CAM_CONFIG_PATH, 'utf8'));
            if (fs.existsSync(EDGE_CONFIG_PATH)) this.edgeConfig = JSON.parse(fs.readFileSync(EDGE_CONFIG_PATH, 'utf8'));
        } catch (e) { }
    }

    async pipelineTick() {
        const cams = cameraStore.list();
        for (const cam of cams) {
            if (cam.status === "ONLINE") this.runPipelineForCamera(cam.id);
        }
    }

    async runPipelineForCamera(camId) {
        const cam = cameraStore.get(camId);
        if (!cam) return;

        // 1. CONFIG CHECK
        if (!cam.ai_server || !cam.ai_server.enabled) {
            // Only log this rarely or once per startup to avoid spam, but for debug now:
            // console.log(`[AI] ${camId}: AI Disabled`);
            return;
        }
        if (!cam.ai_server.zones || cam.ai_server.zones.length === 0) {
            // console.log(`[AI] ${camId}: No Zones Defined`);
            return;
        }

        // 2. ARMING CHECK
        if (!isArmed(cam)) {
            // Debug log to see WHY it's disarmed
            // console.log(`[AI] ${camId}: Camera Disarmed`);
            return;
        }

        // 3. DEBOUNCE
        const now = Date.now();
        let state = this.cameraStates.get(camId) || { lastTriggerTs: 0, prevBuffer: null };
        if (now - state.lastTriggerTs < DEBOUNCE_INTERVAL_MS) return; // Debounce silent

        // 4. FRAME ACQUISITION
        const ramDiskPath = path.resolve(__dirname, '../../recorder/ramdisk/snapshots', `${camId}.jpg`);
        if (!fs.existsSync(ramDiskPath)) return;
        const stats = fs.statSync(ramDiskPath);
        if (now - stats.mtimeMs > 3000) {
            // console.log(`[AI] ${camId}: Stale Snapshot (>3s)`);
            return;
        }

        // 5. MOTION DETECTION (Hybrid)
        let motionDetected = false;
        let method = "NONE";

        // Native
        if (this.libMotion) {
            let detector = this.detectors.get(camId);
            if (!detector) {
                detector = this.fnCreate(640, 360, 0.005, 1, 25.0);
                this.detectors.set(camId, detector);
            }
            const res = this.fnProcess(detector, ramDiskPath);
            if (res > 0) {
                motionDetected = true;
                method = "NATIVE";
            }
        }

        // Software Fallback
        if (!motionDetected) {
            const currentBuffer = fs.readFileSync(ramDiskPath);
            if (state.prevBuffer && state.prevBuffer.length > 0) {
                const diff = this.calculateBufferDiff(state.prevBuffer, currentBuffer);
                if (diff > 0.02) {
                    motionDetected = true;
                    method = `SOFTWARE (${(diff * 100).toFixed(1)}%)`;
                }
            }
            state.prevBuffer = currentBuffer;
        }

        if (!motionDetected) {
            this.cameraStates.set(camId, state);
            return;
        }

        // TRIGGER ACCEPTED
        console.log(`[AI] [MOTION AUTHORIZED] ${camId} (Method: ${method}) -> AI REQUEST`);

        state.lastTriggerTs = now;
        this.cameraStates.set(camId, state);

        // 6. QUEUE JOB
        const jobBuffer = state.prevBuffer || fs.readFileSync(ramDiskPath); // use cached or fresh

        this.queue.push({
            camId,
            timestamp: now,
            camConfig: cam,
            buffer: jobBuffer
        });

        if (this.queue.length > 5) this.queue.shift();
    }

    // Simple Buffer Comparison (Byte variance) - Very rough but fast fallback
    calculateBufferDiff(buf1, buf2) {
        if (buf1.length !== buf2.length) return 1.0; // Different size = changed
        let diffs = 0;
        // Sample 1% of bytes for speed
        const step = 100;
        let samples = 0;
        for (let i = 0; i < buf1.length; i += step) {
            samples++;
            if (Math.abs(buf1[i] - buf2[i]) > 20) diffs++; // Threshold 20/255
        }
        return diffs / samples;
    }

    async processQueue() {
        if (this.activeRequests >= 2) return;
        if (this.queue.length === 0) return;

        const task = this.queue.shift();
        this.activeRequests++;
        try { await this.executeTask(task); }
        catch (e) { console.error(`[AI] Error ${task.camId}:`, e.message); }
        finally { this.activeRequests--; }
    }

    async executeTask(task) {
        const { camId, timestamp, camConfig, buffer } = task;
        const tmpPath = path.join(os.tmpdir(), `ai_req_${camId}_${timestamp}.jpg`);
        fs.writeFileSync(tmpPath, buffer);

        // Normalize Classes & Zones
        let requiredClasses = new Set();
        let payloadZones = [];

        camConfig.ai_server.zones.forEach(z => {
            const objs = Array.isArray(z.objects) ? z.objects : [];
            // Legacy bools
            if (z.person) objs.push('person');
            if (z.car) objs.push('car');
            if (z.truck) objs.push('truck');
            if (z.bus) objs.push('bus');
            if (z.animal) objs.push('dog');
            objs.forEach(o => requiredClasses.add(o));

            payloadZones.push({
                type: 'INCLUDE',
                points: z.points,
                rect: z.x !== undefined ? { x: z.x, y: z.y, w: z.w, h: z.h } : null
            });
        });

        if (camConfig.ai_server.exclusions) {
            camConfig.ai_server.exclusions.forEach(z => {
                payloadZones.push({ type: 'EXCLUDE', points: z.points, rect: z.rect });
            });
        }

        if (requiredClasses.size === 0) {
            fs.unlink(tmpPath, () => { });
            return;
        }

        const detectList = Array.from(requiredClasses);
        console.log(`[AI] Sending ${camId} -> Hub (Classes: ${detectList.length})`);

        const rawResults = await this.sendToHub(tmpPath, camId, this.edgeConfig.name, detectList, payloadZones);

        // Validation (30% Intersection)
        if (rawResults && rawResults.length > 0) {
            const validated = rawResults.filter(d => {
                let bbox = d.box || (typeof d.x === 'number' ? d : null);
                if (Array.isArray(d)) bbox = { x: d[0], y: d[1], w: d[2], h: d[3] };
                if (!bbox) return false;

                // Normalize to 0-1
                if (bbox.x > 1 || bbox.w > 1) {
                    bbox = { x: bbox.x / 1920, y: bbox.y / 1080, w: bbox.w / 1920, h: bbox.h / 1080 };
                }

                return this.validateIntersection(bbox, payloadZones);
            });

            if (validated.length > 0) {
                console.log(`[AI] EVENT CONFIRMED: ${camId} (${validated.length} objects)`);
                this.emit('ai_result', {
                    camId,
                    timestamp,
                    detections: validated,
                    imagePath: tmpPath,
                    originalPath: tmpPath
                });
                return;
            }
        }
        fs.unlink(tmpPath, () => { });
    }

    async sendToHub(imagePath, camId, origin, detectList, zones) {
        const url = this.config.hub_url || HUB_DEFAULT_URL;
        try {
            const b64 = fs.readFileSync(imagePath).toString('base64');
            const agentOptions = { localAddress: '10.200.0.3' };
            const httpAgent = new http.Agent(agentOptions);
            const httpsAgent = new https.Agent(agentOptions);
            const res = await axios.post(url, {
                image: b64, camId, origin, detect: detectList, zones, module: 'ai_small'
            }, {
                timeout: 4000,
                httpAgent,
                httpsAgent
            });
            return (res.data.detections || res.data || []);
        } catch (e) { return []; }
    }

    validateIntersection(bbox, zones) {
        // Must intersect INCLUDE > 30%
        const includes = zones.filter(z => z.type === 'INCLUDE');
        const excludes = zones.filter(z => z.type === 'EXCLUDE');

        const boxArea = bbox.w * bbox.h;
        if (boxArea === 0) return false;

        let maxOverlap = 0;
        for (const z of includes) {
            const zNorm = this.normalizeZone(z);
            const overlap = this.calcOverlap(bbox, zNorm);
            if (overlap > maxOverlap) maxOverlap = overlap;
        }

        if ((maxOverlap / boxArea) < MIN_ZONE_INTERSECTION) return false;

        // Must NOT intersect EXCLUDE (Strict)
        for (const z of excludes) {
            if (this.intersects(bbox, this.normalizeZone(z))) return false;
        }
        return true;
    }

    normalizeZone(z) {
        if (z.points?.length) {
            const xs = z.points.map(p => p[0]);
            const ys = z.points.map(p => p[1]);
            const minX = Math.min(...xs), minY = Math.min(...ys);
            return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
        }
        return z.rect || { x: 0, y: 0, w: 0, h: 0 };
    }

    calcOverlap(r1, r2) {
        return Math.max(0, Math.min(r1.x + r1.w, r2.x + r2.w) - Math.max(r1.x, r2.x)) *
            Math.max(0, Math.min(r1.y + r1.h, r2.y + r2.h) - Math.max(r1.y, r2.y));
    }

    intersects(a, b) {
        return (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
    }
}
module.exports = new AIRequestManager();
