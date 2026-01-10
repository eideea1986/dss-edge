const aiClient = require('../aiClient'); // Refolosim clientul B64
const db = require('./Database');

class Analyzer {
    constructor() {
        this.cameraStatus = {};
    }

    processFrame(camId, frameBuffer, aiConfig, isArmed) {
        if (!isArmed) return;

        const now = Date.now();
        if (!this.cameraStatus[camId]) this.cameraStatus[camId] = { lastSent: 0 };

        // Throttling la 1 secunda pentru stabilitate (Trassir Style - nu procesam fiecare frame)
        if (now - this.cameraStatus[camId].lastSent < 1000) return;

        this.cameraStatus[camId].lastSent = now;

        const metadata = {
            "Camera-ID": camId,
            "Zones": JSON.stringify(aiConfig.zones || []),
            "ROI-Points": JSON.stringify(aiConfig.roi || []),
            "Object-Types": JSON.stringify(aiConfig.objects || ["person", "car"]),
            "Sensitivity": (aiConfig.sensitivity || 50).toString()
        };

        // Trimitem la AI
        global.sendToAI(camId, frameBuffer, metadata);
    }

    handleAIResponse(camId, detections, snapshotB64) {
        if (detections && detections.length > 0) {
            console.log(`[Analyzer] Detected ${detections.length} objects on ${camId}`);
            // Salvam in DB segmentul de eveniment
            const now = Math.floor(Date.now() / 1000);
            db.db.run(`INSERT INTO ai_events (cam_id, timestamp, label, zones) VALUES (?, ?, ?, ?)`,
                [camId, now, detections[0].class, JSON.stringify(detections.map(d => d.zone))]
            );

            // Aici vom declansa broadcast-ul catre Dispatch/UI - ramane neschimbat pentru moment
        }
    }
}

module.exports = new Analyzer();
