const comms = require('./CommunicationManager');
const db = require('./Database');

class IntelligenceEngine {
    constructor() {
        this.cameraThrottles = {};
    }

    /**
     * Procesează un frame brut și decide dacă trebuie trimis la AI.
     */
    analyzeFrame(camId, frameBuffer, aiConfig, isArmed) {
        if (!isArmed) return;

        const now = Date.now();
        if (!this.cameraThrottles[camId]) this.cameraThrottles[camId] = 0;

        // Throttling: 1 refresh pe secundă pentru AI
        if (now - this.cameraThrottles[camId] < 1000) return;
        this.cameraThrottles[camId] = now;

        const metadata = {
            "Camera-ID": camId,
            "Zones": JSON.stringify(aiConfig.zones || []),
            "ROI-Points": JSON.stringify(aiConfig.roi || []),
            "Object-Types": JSON.stringify(aiConfig.objects || ["person", "car"]),
            "Sensitivity": (aiConfig.sensitivity || 50).toString()
        };

        // global.sendToAI este injectat de aiClient.js
        if (global.sendToAI) {
            global.sendToAI(camId, frameBuffer, metadata);
        }
    }

    /**
     * Callback apelat de aiClient.js când primim rezultate.
     */
    handleDetections(camId, detections, snapshotB64, cameraName) {
        if (detections && detections.length > 0) {
            console.log(`[Intelligence] Object detected on ${cameraName}: ${detections[0].class}`);

            // 1. Persistență în baza de date locală
            const now = Math.floor(Date.now() / 1000);
            db.db.run(`INSERT INTO ai_events (cam_id, timestamp, label, zones) VALUES (?, ?, ?, ?)`,
                [camId, now, detections[0].class, JSON.stringify(detections.map(d => d.zone))]
            );

            // 2. Transmitem către Dispatch și restul sistemului prin CommunicationManager
            comms.broadcastEvent(camId, cameraName, detections, snapshotB64);
        }
    }
}

module.exports = new IntelligenceEngine();
