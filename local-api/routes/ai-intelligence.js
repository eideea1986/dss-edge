const express = require("express");
const router = express.Router();
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../config/ai_intelligence.json');

// Ensure config dir exists
const configDir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(configDir)) {
    try { fs.mkdirSync(configDir, { recursive: true }); } catch (e) { }
}

// Stats (In-Memory / Live)
const stats = {
    tracked_objects: 0,
    events_today: 0,
    false_zones: 0,
    start_time: Math.floor(process.uptime())
};

// Default Config
const DEFAULT_CONFIG = {
    enabled: false,
    motion_only: true,
    detection_count_before_ignore: 5,
    stability_frames: 3,
    min_displacement_pixels: 50,
    threshold: 0.3,
    cooldown_seconds: 30,
    excluded_zones: [],
    min_area_ratio: 0.005,
    static_variance_limit: 5.0
};

// Helper: Load/Save
function getStoredConfigs() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Error reading AI Config:", e);
    }
    return {};
}

function saveStoredConfigs(configs) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing AI Config:", e);
    }
}

// GET Stats
router.get("/api/stats", (req, res) => {
    res.json({
        ...stats,
        uptime_seconds: Math.floor(process.uptime())
    });
});

// GET Config
router.get("/config/:camId", (req, res) => {
    const configs = getStoredConfigs();
    const camConfig = configs[req.params.camId] || {};

    // Ensure structure matches UI expectations (nested under false_detection_filter?)
    // The previous mock had: { config: { false_detection_filter: ... } }
    // UI expects specific structure. 
    // Adapting to UI:
    // UI likely expects { config: { ... } } or just the object.
    // Based on previous file: "res.json({ config: mockConfig });"
    // And mockConfig had "false_detection_filter".
    // I will serve that structure.

    const responseStructure = {
        false_detection_filter: {
            enabled: camConfig.enabled ?? DEFAULT_CONFIG.enabled,
            motion_only: camConfig.motion_only ?? DEFAULT_CONFIG.motion_only,
            detection_count_before_ignore: camConfig.detection_count_before_ignore ?? DEFAULT_CONFIG.detection_count_before_ignore,
            stability_frames: camConfig.stability_frames ?? DEFAULT_CONFIG.stability_frames,
            min_displacement_pixels: camConfig.min_displacement_pixels ?? DEFAULT_CONFIG.min_displacement_pixels,
            static_variance_limit: camConfig.static_variance_limit ?? DEFAULT_CONFIG.static_variance_limit,
            threshold: camConfig.threshold ?? DEFAULT_CONFIG.threshold
        },
        event_manager: {
            cooldown_seconds: camConfig.cooldown_seconds ?? DEFAULT_CONFIG.cooldown_seconds
        }
    };

    res.json({ config: responseStructure });
});

// POST Config
const cameraStore = require('../store/cameraStore'); // Correct relative path from local-api/routes/

// ...

router.post("/config/:camId", async (req, res) => {
    const camId = req.params.camId;
    const body = req.body;

    // 1. Save to ai_intelligence.json (local overrides)
    const configs = getStoredConfigs();

    if (body.false_detection_filter) {
        configs[camId] = {
            ...configs[camId],
            ...body.false_detection_filter,
            cooldown_seconds: body.event_manager?.cooldown_seconds
        };
        saveStoredConfigs(configs);

        // 2. SYNC THRESHOLD TO CAMERA STORE (Critical for EventManager)
        if (body.false_detection_filter.threshold !== undefined || body.event_manager?.cooldown_seconds !== undefined) {
            try {
                const cam = cameraStore.get(camId);
                if (cam) {
                    if (!cam.ai_server) cam.ai_server = {};
                    if (body.false_detection_filter.threshold !== undefined) {
                        cam.ai_server.threshold = parseFloat(body.false_detection_filter.threshold);
                    }
                    if (body.event_manager?.cooldown_seconds !== undefined) {
                        cam.ai_server.cooldown_seconds = parseInt(body.event_manager.cooldown_seconds);
                    }
                    await cameraStore.update(camId, cam); // Persist to cameras.json
                    console.log(`[AI-Config] Synced to camera store for ${camId}`);
                }
            } catch (e) { console.error("Camera Store Sync Error", e); }
        }

        res.json({ success: true, message: "Saved & Synced" });
    } else {
        res.status(400).json({ success: false, message: "Invalid payload" });
    }
});

module.exports = router;
module.exports.getStoredConfigs = getStoredConfigs;
