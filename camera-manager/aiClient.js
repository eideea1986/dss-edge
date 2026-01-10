const axios = require("axios");

// URL of the AI Server (Python)
const PRIMARY_AI_URL = "http://192.168.120.205:5001/detect";
const LOCAL_AI_URL = "http://localhost:5001/detect";

async function sendToAI(camId, frameBuffer, metadata) {
    // 1. Prepare Payload
    const b64Image = frameBuffer.toString('base64');
    let roi = [];
    let zones = [];
    let objects = [];
    if (metadata["ROI-Points"]) {
        try { roi = JSON.parse(metadata["ROI-Points"]); } catch (e) { }
    }
    if (metadata["Zones"]) {
        try { zones = JSON.parse(metadata["Zones"]); } catch (e) { }
    }
    if (metadata["Object-Types"]) {
        try { objects = JSON.parse(metadata["Object-Types"]); } catch (e) { }
    }

    // Note: If using multiple zones from camera config, we should ideally pass 'zones' instead of 'roi'
    // But metadata currently flattens it. Assuming cameraManager passes compatible structure.

    const payload = {
        image: b64Image,
        module: metadata["AI-Module"] || "ai_small",
        sensitivity: parseFloat(metadata["Sensitivity"] || 0.5),
        zones: zones, // Use new Multi-Zones
        roi: roi, // Fallback to Legacy ROI
        objects: objects.reduce((acc, curr) => ({ ...acc, [curr]: true }), {})
    };

    // 2. Try Primary (HUB)
    try {
        const response = await axios.post(PRIMARY_AI_URL, payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 2000 // Short timeout for HUB finding
        });
        handleResponse(camId, response.data, b64Image);
        return;
    } catch (primaryErr) {
        // console.warn(`[AI Client] Primary Hub Failed (${primaryErr.message}). Trying Local...`);
    }

    // 3. Try Local (Fallback)
    try {
        const response = await axios.post(LOCAL_AI_URL, payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 5000
        });
        handleResponse(camId, response.data, b64Image);
    } catch (localErr) {
        console.error(`[AI Client] All AI Servers failed for ${camId}.`);
    }
}

function handleResponse(camId, data, b64Image) {
    // Data is array of detections
    if (data && Array.isArray(data) && data.length > 0) {
        console.log(`[AI] ${camId}: Detected ${data.length} objects`);
        if (global.broadcastAI) {
            global.broadcastAI(camId, { detections: data, snapshot: b64Image });
        }
    }
}

module.exports = { sendToAI };
global.sendToAI = sendToAI;
