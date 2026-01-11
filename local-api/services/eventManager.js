/* eventManager.js - Enterprise Event Lifecycle Manager */
const aiManager = require('./aiRequest');
const dispatchClient = require('./dispatchClient');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// CONFIGURATION
const EDGE_ID = "edge-208";
const EVENTS_DIR = path.resolve(__dirname, '../../events');
const CONFIRMATION_TARGET_HITS = 2;
const CONFIRMATION_WINDOW_MS = 5000;
const COOLDOWN_MS = 10000;

// Ensure storage
if (!fs.existsSync(EVENTS_DIR)) {
    try { fs.mkdirSync(EVENTS_DIR, { recursive: true }); } catch (e) { }
}

class EventManager {
    constructor() {
        // State Map: key=`${camId}:${type}` -> object
        this.states = new Map();

        // 1. INGEST (Producer)
        aiManager.on('ai_result', (data) => this.handleAIResult(data));

        // 2. FEEDBACK (Ack)
        dispatchClient.on('ack', ({ eventId }) => this.handleAck(eventId));

        console.log(`[EventManager] Active. Identity: ${EDGE_ID}`);

        // 3. CLEANUP (Garbage Collector)
        setInterval(() => this.maintenanceLoop(), 1000);
    }

    handleAIResult(data) {
        const { camId, detections, imagePath } = data;
        const now = Date.now();

        // Filter Weak
        const relevant = detections.filter(d => d.score >= 0.5);
        if (relevant.length === 0) { fs.unlink(imagePath, () => { }); return; }

        const primary = relevant[0];
        const type = primary.label || "object";
        const key = `${camId}:${type}`;

        // Get or Init State
        let entry = this.states.get(key) || {
            state: "IDLE",
            hits: 0,
            firstSeen: 0,
            lastSeen: 0,
            evidence: [],
            eventId: null,
            cooldownUntil: 0
        };

        // --- STATE MACHINE ---

        // 1. BLOCKED States (COOLDOWN or Awaiting ACK)
        if (entry.state === "COOLDOWN") {
            fs.unlink(imagePath, () => { });
            return;
        }

        if (entry.state === "SENT") {
            // Ignoring triggers while waiting for ACK to ensure Lifecycle completion
            fs.unlink(imagePath, () => { });
            return;
        }

        // 2. ACTIVE States
        if (entry.state === "IDLE") {
            entry.state = "DETECTED";
            entry.hits = 1;
            entry.firstSeen = now;
            entry.lastSeen = now;
            entry.evidence.push(imagePath);
        } else if (entry.state === "DETECTED") {
            entry.hits++;
            entry.lastSeen = now;
            entry.evidence.push(imagePath);

            if (now - entry.firstSeen > CONFIRMATION_WINDOW_MS) {
                // Window Expired -> Reset to IDLE, or treat this as new First Seen
                this.cleanupEvidence(entry.evidence);
                // Restart logic with current hit
                entry = {
                    state: "DETECTED",
                    hits: 1,
                    firstSeen: now,
                    lastSeen: now,
                    evidence: [imagePath],
                    eventId: null,
                    cooldownUntil: 0
                };
            }
            else if (entry.hits >= CONFIRMATION_TARGET_HITS) {
                // TRANSITION -> CONFIRMED
                this.confirmEvent(entry, camId, type);
            }
        }

        this.states.set(key, entry);
    }

    confirmEvent(entry, camId, type) {
        entry.state = "CONFIRMED";
        const now = Date.now();
        const eventId = crypto.randomUUID();
        entry.eventId = eventId;

        // Freeze Snapshot
        // Get the best image (last one)
        const bestTmp = entry.evidence[entry.evidence.length - 1];
        const snapshotName = `${eventId}.jpg`;
        const frozenPath = path.join(EVENTS_DIR, snapshotName);

        try {
            fs.renameSync(bestTmp, frozenPath);
            // Cleanup others
            entry.evidence.forEach(p => { if (p !== bestTmp) fs.unlink(p, () => { }); });
            entry.evidence = [];
        } catch (e) {
            console.error(`[Event] Snapshot Freeze Error: ${e.message}`);
        }

        // Create Payload (Standardized)
        const eventObject = {
            eventId: eventId,
            edgeId: EDGE_ID,
            cameraId: camId,
            type: type,
            firstSeen: entry.firstSeen,
            confirmedAt: now,
            snapshot: `/events/${snapshotName}`,
            state: "SENT",
            meta: { hits: entry.hits }
        };

        console.log(`[Event] 🚨 CONFIRMED ${type} on ${camId} (ID: ${eventId}). Sending...`);

        // TRANSITION -> SENT
        entry.state = "SENT";

        // Transport
        dispatchClient.send(eventObject);
    }

    handleAck(eventId) {
        const now = Date.now();
        for (const [key, entry] of this.states) {
            if (entry.eventId === eventId) {
                console.log(`[Event] ✅ ACK received for ${eventId}. Entering COOLDOWN.`);

                // TRANSITION -> COOLDOWN
                entry.state = "COOLDOWN";
                entry.cooldownUntil = now + COOLDOWN_MS;
                entry.eventId = null;

                this.states.set(key, entry);
                return;
            }
        }
    }

    maintenanceLoop() {
        const now = Date.now();
        for (const [key, entry] of this.states) {
            // Expire stale DETECTED
            if (entry.state === "DETECTED" && (now - entry.lastSeen > CONFIRMATION_WINDOW_MS)) {
                this.cleanupEvidence(entry.evidence);
                this.states.delete(key);
            }
            // Expire COOLDOWN
            if (entry.state === "COOLDOWN" && now > entry.cooldownUntil) {
                this.states.delete(key);
            }
        }
    }

    cleanupEvidence(list) {
        if (!list) return;
        list.forEach(p => fs.unlink(p, () => { }));
    }
}

module.exports = new EventManager();
