const express = require("express");
const axios = require("axios");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { performSync } = require("../../orchestrator/syncManager");


// Location of the config file shared with event-engine
// We assume they are in peer directories: local-api/../event-engine/dispatch.json
const configPath = path.join(__dirname, "../../event-engine/dispatch.json");

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) { console.error("Config Load Error", e); }
    return { dispatchUrl: "http://localhost:8091/events", dispatchUrls: [], dispatchActiveUrl: "" };
}

function saveConfig(cfg) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    } catch (e) {
        console.error("Config Save Error", e);
        throw e;
    }
}

// Define routes using router...
router.post("/sync", async (req, res) => {
    try {
        const result = await performSync(axios);

        if (result && result.success) {
            res.json({ status: "ok", message: "Sync successful" });
        } else {
            res.status(500).json({ error: result?.error || "Sync failed" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get("/", (req, res) => {
    const config = loadConfig();
    res.json({
        url: config.dispatchUrl, // Legacy support
        urls: config.dispatchUrls || [config.dispatchUrl], // New multi-url
        activeUrl: config.dispatchActiveUrl
    });
});

// POST /dispatch
router.post("/", (req, res) => {
    try {
        const { url, urls } = req.body;
        const config = loadConfig();

        if (urls && Array.isArray(urls)) {
            config.dispatchUrls = urls;
            // Set first one as active default if not set
            if (!config.dispatchActiveUrl && urls.length > 0) {
                config.dispatchActiveUrl = urls[0];
            }
            // Backwards compatibility for single url systems
            if (urls.length > 0) config.dispatchUrl = urls[0];
        } else if (url) {
            config.dispatchUrl = url;
            config.dispatchUrls = [url];
            config.dispatchActiveUrl = url;
        }

        saveConfig(config);

        // Notify Orchestrator (Optional, or it polls file provided orchestrator reloads config)
        // Here we just save to disk.

        res.json({ status: "ok", message: "Dispatch URL(s) saved" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



module.exports = router;
