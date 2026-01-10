const http = require('http');

class CommunicationManager {
    constructor() {
        this.recentEvents = [];
    }

    /**
     * Trimite evenimentul detectat către Dispatch Server și către Event Engine local.
     */
    broadcastEvent(camId, cameraName, detections, snapshot) {
        const evt = {
            timestamp: Date.now(),
            cameraId: camId,
            cameraName: cameraName,
            detections: detections,
            snapshot: snapshot // Base64
        };

        console.log(`[CommManager] Broadcasting event for ${cameraName} (${camId})`);

        // 1. Store locally for UI
        this.recentEvents.unshift(evt);
        if (this.recentEvents.length > 20) this.recentEvents.pop();

        // 2. Trimite la Event Engine Local (Port 5005)
        this.sendToLocalEngine(evt);

        // 3. Trimite la Dispatch (Local API /dispatch route handles forwarding to cloud)
        this.sendToDispatch(evt);
    }

    sendToLocalEngine(evt) {
        const postData = JSON.stringify(evt);
        const req = http.request({
            hostname: 'localhost',
            port: 5005,
            path: '/event',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => { });
        req.on('error', (e) => console.warn(`[CommManager] Local Engine Offline (5005)`));
        req.write(postData);
        req.end();
    }

    sendToDispatch(evt) {
        // Local API port 8080 has a route to sync with dispatch
        const postData = JSON.stringify(evt);
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/dispatch/event', // Presupunem ruta aceasta in Local API
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => { });
        req.on('error', (e) => { });
        req.write(postData);
        req.end();
    }

    getRecentEvents() {
        return this.recentEvents;
    }
}

module.exports = new CommunicationManager();
