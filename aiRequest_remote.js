const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const EventEmitter = require('events');
const os = require('os');
const cameraStore = require('../store/cameraStore');
const { isArmed } = require('../../camera-manager/armingLogic');

const CAM_CONFIG_PATH = path.join(__dirname, '../../config/cameras.json');
const AI_CONFIG_PATH = path.join(__dirname, '../ai_config.json');

// Tuning Constants (Trassir style)
const MAX_CONCURRENT_REQUESTS = 3;
const SAMPLING_INTERVAL_MS = 2000;  // 2 seconds between AI requests for the same camera
const REQUEST_TIMEOUT_MS = 5000;
// NEW ARCHITECTURE: VPN2 (10.200.0.x) for AI Images
// FALLBACK: Local IP (VPN unreachable)
const HUB_DEFAULT_URL = "http://192.168.120.205:8080/api/hub/analyze";


class AIRequestManager extends EventEmitter {
    constructor() {
        super();
        this.config = { hub_url: HUB_DEFAULT_URL, active_module: "ai_small", enabled: true };
        this.cameras = [];
        this.loadConfigs();

        this.queue = [];
        this.activeRequests = 0;
        this.cameraStates = new Map(); // camId -> { lastProcessedTs, prevFrameBuffer }

        this.consecutiveFailures = 0;
        this.circuitOpenUntil = 0;

        // Safety Start Delay (Allow system to boot)
        this.circuitOpenUntil = Date.now() + 5000;

        setInterval(() => this.processQueue(), 100);

        // BACKGROUND POLLING (Safety Loop)
        // If regular motion trigger fails, this ensures armed cameras are still analyzed periodically
        setInterval(() => this.backgroundPoll(), 2000);
    }

    async backgroundPoll() {
        if (this.queue.length > 3) return; // Don't overload if queue is already busy
        const cams = cameraStore.list();
        for (const cam of cams) {

            if (cam.status === "ONLINE" && (cam.ai_server?.enabled || cam.ai)) {
                const now = Date.now();
                const state = this.cameraStates.get(cam.id) || { lastProcessedTs: 0 };
                // Poll every 5 seconds for armed cameras as a safety
                if (now - state.lastProcessedTs > 5000) {
                    this.handleMotion(cam.id);
                }
            }
        }
    }


    loadConfigs() {
        try {
            if (fs.existsSync(AI_CONFIG_PATH)) {
                const loaded = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'));
                this.config = { ...this.config, ...loaded };
            }
            // Force user preference for HUB 205 if not explicitly differently set
            if (!this.config.hub_url || this.config.hub_url.includes(".209")) {
                this.config.hub_url = HUB_DEFAULT_URL;
            }

            if (fs.existsSync(CAM_CONFIG_PATH)) {
                this.cameras = JSON.parse(fs.readFileSync(CAM_CONFIG_PATH, 'utf8'));
            }
        } catch (e) { }
    }

    async handleMotion(camId) {
        // Circuit Breaker Check
        if (Date.now() < this.circuitOpenUntil) return;

        console.log(`[AI-DEBUG] >>> START Motion for ${camId}`);
        const cam = cameraStore.get(camId);
        if (!cam || cam.status !== "ONLINE") {
            console.log(`[AI-DEBUG] Cam ${camId} Offline or Unknown`);
            return;
        }

        let isAllowed = false;
        let rejectReason = "";

        // Enterprise Logic Checks
        const hasZones = cam.ai_server && cam.ai_server.zones && cam.ai_server.zones.length > 0;
        const armedStatus = require('../../camera-manager/armingLogic').isArmed(cam);

        if (cam.ai_server) {
            // Enterprise Mode: Zones are optional (fallback to full frame)
            isAllowed = armedStatus;
            if (!armedStatus) rejectReason = "System/Schedule Disarmed";
        } else {
            // Legacy Fallback: Must have AI enabled AND system armed
            isAllowed = !!cam.ai && armedStatus;
            if (!cam.ai) rejectReason = "Legacy AI Disabled";
            else if (!armedStatus) rejectReason = "System/Schedule Disarmed";
        }

        if (!isAllowed) {
            console.log(`[AI-DEBUG] Blocked ${camId}: Reason=${rejectReason} (Armed=${armedStatus ? 1 : 0})`);
            return;
        }

        const now = Date.now();
        const state = this.cameraStates.get(camId) || { lastProcessedTs: 0, prevFrameBuffer: null };

        if (now - state.lastProcessedTs < SAMPLING_INTERVAL_MS) {
            // console.log(`[AI-DEBUG] Rate Limit ${camId}`); // noisy
            return;
        }

        // 1. Get current frame
        // 1. Get current frame
        const ramDiskPath = path.resolve(__dirname, '../../recorder/ramdisk/snapshots', `${camId}.jpg`);

        let hasValidSnapshot = false;
        try {
            if (fs.existsSync(ramDiskPath)) {
                const stats = fs.statSync(ramDiskPath);
                if (stats.size > 0) hasValidSnapshot = true;
            }
        } catch (e) { }

        if (!hasValidSnapshot) {
            console.log(`[AI-DEBUG] Snapshot Empty/Missing for ${camId}. Fallback to Go2RTC...`);
            try {
                const resp = await axios.get(`http://127.0.0.1:1984/api/frame.jpeg?src=${camId}`, {
                    responseType: 'arraybuffer',
                    timeout: 1500 // Increased timeout for busy systems
                });
                if (resp.data && resp.data.length > 0) {
                    fs.writeFileSync(ramDiskPath, resp.data);
                    hasValidSnapshot = true;
                } else {
                    throw new Error("Go2RTC Zero Bytes");
                }
            } catch (e) {
                // If Go2RTC fails, we skip this cycle instead of blocking the whole process with execSync
                // The next poll in 2 seconds will try again.
                // console.log(`[AI-DEBUG] Snapshot Acquisition Failed for ${camId}: ${e.message}`);
                return;
            }
        }

        if (!hasValidSnapshot) {
            console.log(`[AI-DEBUG] Snapshot missing/empty for ${camId} (Final)`);
            return;
        }

        // --- ENTERPRISE MOTION FILTER (C++) ---
        // Filters out: Clocks, TV screens, Small bugs, Rain (Static Dynamic Noise)
        try {
            if (!this.libMotion) {
                // Lazy Load Lib
                const koffi = require('koffi');
                const libPath = path.join(__dirname, '../native/libmotionfilter.so');
                if (fs.existsSync(libPath)) {
                    this.libMotion = koffi.load(libPath);

                    // Define Structs
                    const JpegResult = koffi.struct('JpegResult', {
                        data: 'uint8_t*',
                        len: 'int',
                        x: 'int',
                        y: 'int',
                        w: 'int',
                        h: 'int'
                    });

                    this.fnCreate = this.libMotion.func('void* create_detector(int width, int height, double minAreaRatio, int minFrames, double maxStaticVariance)');
                    this.fnProcess = this.libMotion.func('int process_frame_file(void* handle, const char* imagePath)');
                    this.fnProcessRoi = this.libMotion.func('JpegResult process_frame_file_roi(void* handle, const char* imagePath)');
                    this.fnSetExclusions = this.libMotion.func('void set_exclusion_zones(void* handle, int* rects, int count)');
                    this.fnDestroy = this.libMotion.func('void destroy_detector(void* handle)');

                    this.detectors = new Map();
                    console.log("[AI] Native Motion Filter Loaded.");
                }
            }

            if (this.libMotion) {
                let detector = this.detectors.get(camId);
                if (!detector) {
                    // Config: minArea=0.0001 (0.01%), minFrames=1, maxStaticVar=50.0 (Very Relaxed)
                    detector = this.fnCreate(640, 360, 0.0001, 1, 50.0);
                    this.detectors.set(camId, detector);
                }

                // Set Exclusion Zones (Masking)
                if (cam.ai_server && cam.ai_server.exclusions && cam.ai_server.exclusions.length > 0) {
                    const rects = [];
                    cam.ai_server.exclusions.forEach(z => {
                        // Assume z is {x,y,w,h} or points
                        if (z.x !== undefined && z.w !== undefined) {
                            rects.push(z.x, z.y, z.w, z.h);
                        } else if (z.points) {
                            // Convert Polygon to BBox
                            const xs = z.points.map(p => p[0]);
                            const ys = z.points.map(p => p[1]);
                            const minX = Math.min(...xs);
                            const maxX = Math.max(...xs);
                            const minY = Math.min(...ys);
                            const maxY = Math.max(...ys);
                            rects.push(minX, minY, maxX - minX, maxY - minY);
                        }
                    });
                    if (rects.length > 0) {
                        this.fnSetExclusions(detector, rects, rects.length / 4);
                    }
                }


                // Set Exclusion Zones (Masking)
                // ... (existing code omitted in replacement, assuming it is preserved above)

                // let result = this.fnProcess(detector, ramDiskPath);
                let result = 1; // Temporarily bypass C++ filter for diagnosis

                if (result === 0) {
                    // Rejected by C++ Filter (No significant motion)
                    return;
                }
                console.log(`[AI-DEBUG] Valid Motion on ${camId} -> Processing`);
            }
        } catch (e) {
            console.error("[AI-DEBUG] Native Filter Error:", e.message);
        }
        // --------------------------------------

        // 2. Add to Queue
        // Check if already queued to avoid flooding
        const existing = this.queue.find(x => x.camId === camId);
        if (existing) return;

        const currentFrame = fs.readFileSync(ramDiskPath);

        if (this.queue.length > 5) {
            console.log(`[AI-DEBUG] Queue FULL (${this.queue.length}) - Dropping ${camId}`);
            return;
        }

        console.log(`[AI] Admitting ${camId} to analysis queue.`);
        this.queue.push({ camId, timestamp: now, camConfig: cam, buffer: currentFrame });
        state.lastProcessedTs = now;
        this.cameraStates.set(camId, state);
    }


    async processQueue() {
        if (Date.now() < this.circuitOpenUntil) {
            setImmediate(() => this.processQueue());
            return;
        }

        if (this.queue.length === 0 || this.activeRequests >= MAX_CONCURRENT_REQUESTS) {
            setTimeout(() => this.processQueue(), 50); // Small sleep to not burn CPU
            return;
        }

        const task = this.queue.shift();
        this.activeRequests++;

        // Don't await here, process parallel
        this.executeTask(task)
            .catch(e => console.error(`[AI] Task Fail ${task.camId}:`, e.message))
            .finally(() => {
                this.activeRequests--;
                setImmediate(() => this.processQueue());
            });
    }

    async executeTask(task) {
        const { camId, timestamp, camConfig, buffer } = task;
        const tmpPath = path.join(os.tmpdir(), `ai_raw_${camId}_${timestamp}.jpg`);
        fs.writeFileSync(tmpPath, buffer);

        let finalPath = tmpPath;
        let cropInfo = null;

        // SMART CROP: If camera has zones, crop the first one to help the AI "see" better (Zoom effect)
        // SMART CROP DISABLED (Causing issues with coordinates vs resolution)
        if (false && camConfig.ai_server?.zones?.length > 0) {
            const zone = camConfig.ai_server.zones[0];
            if (zone.points && zone.points.length >= 3) {
                const cropPath = await this.cropImage(tmpPath, zone);
                if (cropPath) {
                    finalPath = cropPath;
                    cropInfo = zone;
                }
            }
        }

        // Send to HUB 205 (VPN2)
        const rawDetections = await this.sendToHub(finalPath, camId);

        // ENTERPRISE ZONE FILTERING (Strict Include/Exclude)
        let detections = [];
        if (rawDetections && rawDetections.length > 0) {
            const armed = require('../../camera-manager/armingLogic').isArmed(camConfig);

            // Build Unified Zones List
            const zones = [];
            if (camConfig.ai_server?.zones) {
                camConfig.ai_server.zones.forEach(z => zones.push({ ...z, type: 'INCLUDE' }));
            }
            if (camConfig.ai_server?.exclusions) {
                camConfig.ai_server.exclusions.forEach(z => zones.push({ ...z, type: 'EXCLUDE' }));
            }

            detections = rawDetections.filter(d => {
                // Clean Detection BBox to {x,y,w,h} (Normalized)
                let bbox = null;
                // Case 1: Hub returns { box: { x,y,w,h } }
                if (d.box) bbox = d.box;
                // Case 2: Hub returns { x,y,w,h }
                else if (d.x !== undefined) bbox = d;
                // Case 3: Hub returns [x, y, w, h] (Old YOLO)
                else if (Array.isArray(d) && d.length === 4) bbox = { x: d[0], y: d[1], w: d[2], h: d[3] };

                if (!bbox) return true; // Keep if format unknown (safe fallback)

                // Normalize if Pixels (Assume 1920x1080 base if > 1)
                if (bbox.x > 1 || bbox.w > 1) {
                    bbox = { x: bbox.x / 1920, y: bbox.y / 1080, w: bbox.w / 1920, h: bbox.h / 1080 };
                }

                return this.isInArmingZone(bbox, zones, armed);
            });

            console.log(`[AI] Filtered ${rawDetections.length} -> ${detections.length} valid objects.`);

            // ENTERPRISE TRACKING (Correlation)
            detections = this.updateTracks(camId, detections);
        }

        if (detections && detections.length > 0) {
            // Confirm motion & Dispatch
            this.emit('ai_result', {
                camId,
                timestamp,
                detections, // Now contains trackId
                imagePath: finalPath,
                originalPath: tmpPath,
                crop: cropInfo
            });
            // Evidence found, cleanup handled by EventManager
        } else {
            // No detection, cleanup
            fs.unlink(tmpPath, () => { });
            if (finalPath !== tmpPath) fs.unlink(finalPath, () => { });
        }
    }

    // --- TRACKING ENGINE ---
    updateTracks(camId, detections) {
        if (!this.tracks) this.tracks = new Map();
        if (!this.nextTrackId) this.nextTrackId = 1;

        let tracks = this.tracks.get(camId) || [];
        const now = Date.now();

        detections.forEach(det => {
            let bestMatch = null;
            let maxIoU = 0;

            // Match against existing tracks
            tracks.forEach(track => {
                const iou = this.calculateIoU(det.bbox, track.bbox);
                if (iou > 0.3 && iou > maxIoU) {
                    maxIoU = iou;
                    bestMatch = track;
                }
            });

            if (bestMatch) {
                // Update Track
                det.trackId = bestMatch.id;
                bestMatch.bbox = det.bbox;
                bestMatch.lastSeen = now;
                bestMatch.label = det.label;
            } else {
                // Create New Track
                det.trackId = `T${this.nextTrackId++}`;
                tracks.push({
                    id: det.trackId,
                    bbox: det.bbox,
                    lastSeen: now,
                    label: det.label,
                    firstSeen: now
                });
            }
        });

        // Cleanup abandoned tracks (>5s)
        tracks = tracks.filter(t => now - t.lastSeen < 5000);
        this.tracks.set(camId, tracks);

        return detections;
    }

    calculateIoU(boxA, boxB) {
        // Boxes are {x,y,w,h} (Normalized)
        const xA = Math.max(boxA.x, boxB.x);
        const yA = Math.max(boxA.y, boxB.y);
        const xB = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
        const yB = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

        const interW = Math.max(0, xB - xA);
        const interH = Math.max(0, yB - yA);
        const interArea = interW * interH;

        const boxAArea = boxA.w * boxA.h;
        const boxBArea = boxB.w * boxB.h;

        const unionArea = boxAArea + boxBArea - interArea;
        return (unionArea <= 0) ? 0 : interArea / unionArea;
    }

    isInArmingZone(bbox, zones, armed) {
        if (!armed) return true;

        // 1. INCLUDE Check
        const includes = zones.filter(z => z.type === 'INCLUDE');
        if (includes.length > 0) {
            const hasInclude = includes.some(z => this.intersects(bbox, this.normalizeZone(z)));
            if (!hasInclude) return false;
        }

        // 2. EXCLUDE Check
        const excludes = zones.filter(z => z.type === 'EXCLUDE');
        if (excludes.some(z => this.intersects(bbox, this.normalizeZone(z)))) return false;

        return true;
    }

    intersects(a, b) {
        return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }

    normalizeZone(z) {
        if (z.points && Array.isArray(z.points)) {
            const xs = z.points.map(p => p[0]);
            const ys = z.points.map(p => p[1]);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
        }
        if (z.x !== undefined) return z;
        return { x: 0, y: 0, w: 0, h: 0 };
    }

    async cropImage(imagePath, zone) {
        const points = zone.points;
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        const minX = Math.round(Math.min(...xs));
        const maxX = Math.round(Math.max(...xs));
        const minY = Math.round(Math.min(...ys));
        const maxY = Math.round(Math.max(...ys));

        let w = maxX - minX;
        let h = maxY - minY;

        // Force minimum size for FFmpeg and AI
        if (w < 100) w = 100;
        if (h < 100) h = 100;

        const cropPath = imagePath + ".crop.jpg";
        return new Promise((resolve) => {
            // Industrial Crop using FFmpeg
            exec(`ffmpeg -y -v quiet -i "${imagePath}" -vf "crop=${w}:${h}:${minX}:${minY}" "${cropPath}"`, (err) => {
                if (err) {
                    console.error("[AI] FFMPEG Crop Error:", err.message);
                    resolve(null);
                } else resolve(cropPath);
            });
        });
    }

    async sendToHub(imagePath, camId) {
        const url = this.config.hub_url || HUB_DEFAULT_URL;
        console.log(`[AI] Sending analysis request for ${camId} to ${url}...`);
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');

            const response = await axios.post(url, {
                image: base64Image,
                module: this.config.active_module || 'ai_small',
                camId: camId,
                origin: "LOC001"
            }, { timeout: REQUEST_TIMEOUT_MS });

            // Circuit Breaker: Success resets failure count
            if (this.consecutiveFailures > 0) {
                console.log("[AI] Hub Connection Resumed.");
                this.consecutiveFailures = 0;
            }

            let results = response.data.detections || response.data;
            // Handle nested AI response (Wrapper -> AIResponse -> Array)
            if (results && !Array.isArray(results) && Array.isArray(results.detections)) {
                results = results.detections;
            }

            console.log(`[AI] Response for ${camId}: ${results?.length || 0} objects found.`);
            return results;
        } catch (e) {
            this.consecutiveFailures = (this.consecutiveFailures || 0) + 1;
            console.error(`[AI] HUB ${url} Error: ${e.message} (Failures: ${this.consecutiveFailures})`);

            if (this.consecutiveFailures >= 3) {
                console.warn("[AI] ⚠️ Circuit Breaker TRIPPED. Pausing AI for 10s.");
                this.circuitOpenUntil = Date.now() + 10000;
            }
            return null;
        }
    }

}

module.exports = new AIRequestManager();
