const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const MODELS_FILE = path.join(__dirname, "../models.json");

// Cache the models in memory since they don't change often
let modelsCache = null;

try {
    if (fs.existsSync(MODELS_FILE)) {
        const data = fs.readFileSync(MODELS_FILE, "utf8");
        // Strip BOM if present
        const cleanData = data.replace(/^\uFEFF/, '');
        modelsCache = JSON.parse(cleanData);
        console.log(`[Models] Loaded ${modelsCache.manufacturers.length} manufacturers.`);
    } else {
        console.warn("[Models] models.json not found!");
    }
} catch (e) {
    console.error("[Models] Failed to load models.json:", e);
}

// GET /api/models
router.get("/", (req, res) => {
    if (!modelsCache) {
        // Try to reload
        try {
            if (fs.existsSync(MODELS_FILE)) {
                const data = fs.readFileSync(MODELS_FILE, "utf8");
                const cleanData = data.replace(/^\uFEFF/, '');
                modelsCache = JSON.parse(cleanData);
            }
        } catch (e) {
            console.error("[Models] Reload failed:", e);
        }
    }

    if (modelsCache) {
        res.json(modelsCache);
    } else {
        res.status(503).json({ error: "Model database not available" });
    }
});

// Serve Capabilities
router.get('/capabilities', (req, res) => {
    try {
        const d = fs.readFileSync(path.join(__dirname, '../capabilities.json'), 'utf8');
        const cleanD = d.replace(/^\uFEFF/, '');
        res.json(JSON.parse(cleanD));
    } catch (e) {
        res.json({});
    }
});

module.exports = router;
