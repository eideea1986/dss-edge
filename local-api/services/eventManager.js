/* eventManager.js - Enterprise Event Lifecycle Manager */
const aiManager = require('./aiRequest');
const dispatchClient = require('./dispatchClient');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cameraStore = require('../store/cameraStore');
const { exec } = require('child_process');

// CONFIGURATION
const EDGE_ID = "edge-208";
const EVENTS_DIR = path.resolve(__dirname, '../../events');
const CONFIRMATION_TARGET_HITS = 2; // Default validation hits
const DEFAULT_COOLDOWN_MS = 30000;

// OBIECTE PERMISE (Whitelist) - Tot ce nu e aici este ignorat automat
const ALLOWED_CLASSES = ['person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'dog', 'cat', 'backpack', 'suitcase'];

fs.mkdirSync(EVENTS_DIR, { recursive: true });

class EventStateMachine {
    constructor() {
        this.states = new Map(); // key: "camId:objectType"
        aiManager.on('ai_result', (data) => this.handleAIResult(data));
        aiManager.on('motion_start', (data) => this.handleMotion(data));
        setInterval(() => this.maintenanceLoop(), 1000);
    }

    handleAIResult(data) {
        const { camId, detections, imagePath } = data;
        const now = Date.now();
        // Retrieve per-camera threshold (Default: 0.3)
        const cam = cameraStore.get(camId);
        const threshold = cam?.ai_server?.threshold || 0.3;

        // Filter Weak
        const relevant = detections.filter(d => (d.confidence || d.score || 1.0) >= threshold);

        if (relevant.length === 0) { fs.unlink(imagePath, () => { }); return; }

        let anyActive = false;

        // ENTERPRISE CORRELATION: Process each tracked object independently
        relevant.forEach(det => {
            // Enterprise Logic 1: Semantic Whitelist (Anti-Noise)
            if (!ALLOWED_CLASSES.includes(det.label)) {
                console.log(`[Event-DEBUG] Ignored class: ${det.label} on ${camId}`);
                return;
            }

            const type = det.label || "object";

            // Enterprise Logic 2: Global Cooldown (Anti-Spam per Camera + Type)
            const cooldownKey = `COOLDOWN:${camId}:${type}`;
            if (this.states.has(cooldownKey)) return;

            const trackId = det.trackId || `UNKNOWN_${now}_${Math.random()}`;
            const key = `${camId}:${trackId}`; // Key by TRACK ID

            // Get or Init State
            let entry = this.states.get(key) || {
                state: "IDLE",
                hits: 0,
                firstSeen: now,
                lastSeen: now,
                evidence: [],
                detectionData: [],
                eventId: null,
                cooldownUntil: 0
            };

            // --- STATE MACHINE ---

            // 1. BLOCKED States (COOLDOWN or Awaiting ACK)
            if (entry.state === "COOLDOWN") {
                return;
            }
            if (entry.state === "SENT") {
                return;
            }

            // 2. ACTIVE States
            entry.lastSeen = now;

            // Check displacement / static object logic
            // (Simplified for Tracking: Trust Tracker + Zone)

            if (entry.evidence.length === 0 || entry.evidence[entry.evidence.length - 1] !== imagePath) {
                entry.evidence.push(imagePath);
            }

            if (entry.state === "IDLE") {
                entry.state = "DETECTED";
                entry.hits = 1;
                entry.firstSeen = now;
                anyActive = true;

                entry.detectionData.push({ ...det, timestamp: now });

                // Immediate Check
                if (entry.hits >= CONFIRMATION_TARGET_HITS) {
                    this.confirmEvent(entry, camId, type);
                }
            } else if (entry.state === "DETECTED") {
                entry.hits++;
                anyActive = true;
                entry.detectionData.push({ ...det, timestamp: now });

                if (entry.hits >= CONFIRMATION_TARGET_HITS) {
                    this.confirmEvent(entry, camId, type);
                }
            }

            // Update State
            this.states.set(key, entry);
        });

        // Cleanup image if not used by any active track?
        // To avoid complexity/race, we rely on Periodic Cleanup or 'confirmEvent' copying.
        // We do NOT delete here if anyActive is true.
        if (!anyActive) {
            fs.unlink(imagePath, () => { });
        }
    }

    async drawBoundingBoxes(imagePath, detections, outputPath) {
        return new Promise((resolve, reject) => {
            if (!detections || detections.length === 0) {
                fs.copyFileSync(imagePath, outputPath);
                return resolve();
            }

            // Build ffmpeg filter for drawing boxes and labels
            let filters = [];
            detections.forEach((det) => {
                if (!det.bbox || !Array.isArray(det.bbox) || det.bbox.length < 4) return;

                const [x, y, w, h] = det.bbox;
                const label = `${det.label}: ${Math.round(det.confidence * 100)}%`;

                // Red bounding box
                filters.push(`drawbox=x=${Math.floor(x)}:y=${Math.floor(y)}:w=${Math.floor(w)}:h=${Math.floor(h)}:color=red@0.9:t=4`);

                // Label background (black box)
                const textY = Math.max(Math.floor(y) - 30, 10);
                filters.push(`drawbox=x=${Math.floor(x)}:y=${textY}:w=${Math.floor(w)}:h=28:color=black@0.8:t=fill`);

                // White text label  
                const escapedLabel = label.replace(/'/g, "\\\\'");
                filters.push(`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${escapedLabel}':x=${Math.floor(x) + 8}:y=${textY + 8}:fontsize=18:fontcolor=white`);
            });

            const filterComplex = filters.join(',');
            const cmd = `ffmpeg -y -i "${imagePath}" -vf "${filterComplex}" "${outputPath}"`;

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('[EventManager] Bounding box draw error:', error.message);
                    // Fallback: copy original
                    try {
                        fs.copyFileSync(imagePath, outputPath);
                    } catch (e) {
                        console.error('[EventManager] Fallback copy failed:', e);
                    }
                }
                resolve();
            });
        });
    }

    async confirmEvent(entry, camId, type) {
        entry.state = "CONFIRMED";
        const now = Date.now();
        const eventId = crypto.randomUUID();
        entry.eventId = eventId;

        // Freeze Snapshot
        const bestTmp = entry.evidence[entry.evidence.length - 1];
        const snapshotName = `${eventId}.jpg`;
        const frozenPath = path.join(EVENTS_DIR, snapshotName);
        const annotatedPath = path.join(EVENTS_DIR, `${eventId}_annotated.jpg`);

        try {
            // Use Copy to allow multiple events from one frame
            fs.copyFileSync(bestTmp, frozenPath);
            // Don't delete original here, let maintenance clean it
            entry.evidence = [];
        } catch (e) {
            console.error(`[Event] Snapshot Freeze Error: ${e.message}`);
        }

        // Draw bounding boxes on snapshot
        await this.drawBoundingBoxes(frozenPath, entry.detectionData, annotatedPath);

        // Read annotated snapshot
        let snapshotBase64 = null;
        try {
            if (fs.existsSync(annotatedPath)) {
                snapshotBase64 = fs.readFileSync(annotatedPath, { encoding: 'base64' });
            }
        } catch (e) {
            console.error("Annotated Snapshot Read Error", e);
            // Fallback to original
            if (fs.existsSync(frozenPath)) {
                snapshotBase64 = fs.readFileSync(frozenPath, { encoding: 'base64' });
            }
        }

        // Fetch camera details for names
        const cam = cameraStore.get(camId);
        const cameraName = cam?.name || cam?.ip || camId;
        const locationName = process.env.LOCATION_NAME || "Edge Server";

        // Build detections array with real data
        const detectionsList = entry.detectionData.map(d => ({
            label: d.label,
            confidence: d.confidence,
            bbox: d.bbox
        }));

        const eventObject = {
            eventId: eventId,
            locationId: EDGE_ID,
            locationName: locationName,
            edgeId: EDGE_ID,
            cameraId: camId,
            cameraName: cameraName,
            requestType: type,
            type: type,
            firstSeen: entry.firstSeen,
            confirmedAt: now,
            snapshot: snapshotBase64 ? `data:image/jpeg;base64,${snapshotBase64}` : null,
            state: "SENT",
            meta: { hits: entry.hits, detectionTimestamp: entry.detectionData[0]?.timestamp },
            detections: detectionsList
        };

        console.log(`[Event] 🚨 CONFIRMED ${type} on ${camId} (ID: ${eventId}). Sending...`);

        // Send to Dispatch (Queued)
        dispatchClient.send(eventObject);

        console.log(`[Event] ✅ Event ${eventId} queued for Dispatch.`);

        // Cooldown based on CAMERA and TYPE to avoid spamming the same event too fast
        const cooldownMs = (cam?.ai_server?.cooldown_seconds || 30) * 1000;

        const cooldownKey = `COOLDOWN:${camId}:${type}`;
        this.states.set(cooldownKey, {
            state: "COOLDOWN",
            cooldownUntil: now + cooldownMs
        });
    }

    handleMotion(data) {
        // Optional motion-based lifecycle triggers
    }

    maintenanceLoop() {
        const now = Date.now();
        for (const [key, entry] of this.states.entries()) {
            if (entry.state === "COOLDOWN" && now > entry.cooldownUntil) {
                if (key.startsWith("COOLDOWN:")) {
                    this.states.delete(key);
                    console.log(`[Event] Spam protection expired for ${key.split(":")[2]}`);
                } else {
                    entry.state = "IDLE";
                    entry.hits = 0;
                    entry.evidence = [];
                    entry.detectionData = [];
                    // console.log(`[Event] ${key} cooldown expired. Reset to IDLE.`);
                }
            }
        }

        // Cleanup TMP files (older than 60s)
        try {
            const os = require('os');
            const tmpDir = os.tmpdir();
            fs.readdir(tmpDir, (err, files) => {
                if (err) return;
                files.forEach(file => {
                    if (file.startsWith('ai_raw_') && file.endsWith('.jpg')) {
                        const filePath = path.join(tmpDir, file);
                        fs.stat(filePath, (err, stats) => {
                            if (err) return;
                            if (now - stats.mtimeMs > 60000) {
                                fs.unlink(filePath, () => { });
                            }
                        });
                    }
                });
            });
        } catch (e) { }
    }
}

// Singleton Export
const eventManager = new EventStateMachine();
module.exports = eventManager;
