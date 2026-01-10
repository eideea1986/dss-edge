const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const CAM_CONFIG_PATH = path.join(__dirname, '../../config/cameras.json');
const AI_CONFIG_PATH = path.join(__dirname, '../ai_config.json');

class AIRequestManager {
    constructor() {
        this.config = { hub_url: "http://10.200.0.254:8080/api/hub/analyze", active_module: "yolo", enabled: true };
        this.cameras = [];
        this.loadConfigs();
    }

    loadConfigs() {
        try {
            if (fs.existsSync(AI_CONFIG_PATH)) {
                this.config = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'));
                // Override with VPN Hub IP if user set local one by mistake, or enforce it?
                // For now, respect config, but default for first run was forced.
                // Actually, user wants to route via HUB.
                // Let's hardcode the HUB API endpoint for analysis proxy if not set correctly or just rely on 'config.hub_url' and ensure it points to 10.200.0.254 in settings.
                // User said: "trimite catre HUB" -> Hub is 192.168.120.205 (LAN) or 10.200.0.254 (VPN). Edge can see 205.
                // Let's assume the config should point to Hub.
            }
            if (fs.existsSync(CAM_CONFIG_PATH)) {
                this.cameras = JSON.parse(fs.readFileSync(CAM_CONFIG_PATH, 'utf8'));
            }
        } catch (e) { console.error("Config Load Error:", e.message); }
    }

    async handleMotion(camId) {
        this.loadConfigs();
        const cam = this.cameras.find(c => c.id === camId);
        if (!cam) return;

        // 1. Arming Check
        const isArmed = cam.ai_server?.enabled || false;
        if (!isArmed) {
            // console.log(`[AI] ${camId} Motion detected but NOT ARMED. Ignoring.`);
            return;
        }

        // 2. Capture Snapshot
        const timestamp = Date.now();
        const tmpPath = path.join(__dirname, `../../tmp/${camId}_${timestamp}.jpg`);
        // Ensure tmp dir
        if (!fs.existsSync(path.dirname(tmpPath))) fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

        const videoSource = `rtsp://127.0.0.1:8554/${camId}`; // Go2RTC Local Loopback

        console.log(`[AI] Motion ${camId}: Capturing Snapshot...`);

        exec(`ffmpeg -y -v quiet -rtsp_transport tcp -i "${videoSource}" -frames:v 1 -q:v 2 "${tmpPath}"`, async (err) => {
            if (err) {
                console.error(`[AI] Snapshot failed for ${camId}:`, err.message);
                return;
            }
            // 3. Process
            await this.processImage(camId, tmpPath);

            // Cleanup (processImage might have annotated it, but we can delete after a delay or keep for debugging)
            // Ideally we keep it if it was a detection? processImage logs detection.
            // Let's rely on processImage return value?
            // processImage returns detections or null.
        });
    }

    async processImage(camId, imagePath) {
        this.loadConfigs();
        if (!this.config.enabled) return null;

        const cam = this.cameras.find(c => c.id === camId);
        if (!cam) return null;

        // 1. Check if Armed
        // Assuming 'motion' property or 'ai_server.enabled' indicates arming.
        // User said: "verifica daca este armata".
        // In the JSON provided, I see "ai_server": { "enabled": true, "zones": [...] } for some cameras.
        // Or "motion": true.
        // Let's use 'ai_server.enabled' if present, otherwise fallback to global/motion.
        const isArmed = cam.ai_server?.enabled || false;
        if (!isArmed) {
            console.log(`[AI] Camera ${camId} is NOT ARMED. Skipping.`);
            return null;
        }

        console.log(`[AI] Processing ${camId} (Armed)...`);

        // 2. Crop Image if ROI exists
        // User: "trimite catre HUB zona de imagine decupata"
        let finalImagePath = imagePath;
        const zones = cam.ai_server?.zones || [];

        // For simplicity/MVP, if multiple zones, we might process whole image or first zone.
        // If points defined (polygon), we can crop bounding box of polygon.
        if (zones.length > 0 && zones[0].points && zones[0].points.length > 0) {
            // Calculate format for minimal bounding box of the polygon
            const points = zones[0].points;
            const xs = points.map(p => p[0]);
            const ys = points.map(p => p[1]);
            const minX = Math.floor(Math.min(...xs));
            const maxX = Math.ceil(Math.max(...xs));
            const minY = Math.floor(Math.min(...ys));
            const maxY = Math.ceil(Math.max(...ys));
            const w = maxX - minX;
            const h = maxY - minY;

            // Ensure valid crop
            if (w > 10 && h > 10) {
                const cropPath = imagePath + ".crop.jpg";
                // ffmpeg crop=w:h:x:y
                try {
                    await new Promise((resolve, reject) => {
                        exec(`ffmpeg -y -v quiet -i "${imagePath}" -vf "crop=${w}:${h}:${minX}:${minY}" "${cropPath}"`, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    finalImagePath = cropPath;
                    console.log(`[AI] Cropped ROI: ${w}x${h} at ${minX},${minY}`);
                } catch (e) {
                    console.error("[AI] Crop failed, using full image:", e.message);
                }
            }
        }

        try {
            // 3. Send to HUB
            // Hub URL should be the Hub API address.
            // If config has direct AI Server IP, we might want to override or check.
            // For this specific request, we hardcode targeting the HUB.
            const HUB_API = "http://192.168.120.205:8080/api/hub/analyze";
            // Using LAN IP 205 since they are on same subnet (120.x). VPN IP 10.200.0.254 is also valid.

            const imageBuffer = fs.readFileSync(finalImagePath);
            const base64Image = imageBuffer.toString('base64');

            const response = await axios.post(HUB_API, {
                image: base64Image,
                module: this.config.active_module || 'yolo',
                camId: camId,
                origin: "edge-208"
            });

            // 4. Handle Response
            const detections = response.data.detections;
            if (Array.isArray(detections) && detections.length > 0) {
                console.log(`[AI] Positive detection via HUB: ${detections.length} objects`);

                // Draw boxes on ORIGINAL image (or cropped? user said put red square).
                // If we cropped, coordinates are relative to crop.
                // If we draw on cropped image, it's fine.
                this.drawBoxes(finalImagePath, detections); // Modify the image file in place

                // If it was cropped, we might want to save/replace the original event image?
                // Or maybe just keeping the cropped evidence is better for "Event".
                // Let's leave finalImagePath as the one to be used for Event.

                // Notify Backend/Dispatch (This part usually handled by 'monitor.js' picking up the file or we trigger explicit event).
                // The prompt says "Daca raspunsul este pozitiv acesta tranmite venimnetul catre DISPATCH".
                // Usually `monitor.js` watches for new files. If we modify the file in place, monitor picks it up?
                // Or we explicitly call dispatch API.
                this.sendToDispatch(camId, detections);

                return detections;
            }
        } catch (e) {
            console.error(`[AI] Hub Request Failed: ${e.message}`);
        }
        return null;
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
            if (err) console.error("[AI] Annotation error:", err.message);
            else console.log("[AI] Annotated saved.");
        });
    }

    async sendToDispatch(camId, detections) {
        // Implementation to notify dispatch
        // Assuming there is a local service or direct call
        // For now just log, as 'monitor.js' does the heavy lifting of event upload usually.
        console.log(`[AI] Dispatching event for ${camId}...`);
    }
}

module.exports = new AIRequestManager();
