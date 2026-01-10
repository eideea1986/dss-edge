const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CONFIG_PATH = path.join(__dirname, "../../config/ai_config.json");

// Helper to read config
const getConfig = () => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return {
            hubUrl: "http://192.168.120.209:5001",
            selectedModule: "ai_small",
            enabled: true
        };
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) { return {}; }
};

const saveConfig = (cfg) => {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } catch (e) { console.error("Save AI Config Error", e); }
};

// Get Config
router.get("/config", (req, res) => {
    res.json(getConfig());
});

// Save Config
router.post("/config", (req, res) => {
    const newCfg = { ...getConfig(), ...req.body };
    saveConfig(newCfg);
    res.json({ success: true, config: newCfg });
});

// Check Status & Get Modules from Remote Hub
router.get("/status", async (req, res) => {
    const cfg = getConfig();
    try {
        // Ping modules endpoint to check connectivity
        const result = await axios.get(`${cfg.hubUrl}/modules`, { timeout: 2000 });
        res.json({
            online: true,
            modules: result.data,
            currentUrl: cfg.hubUrl
        });
    } catch (e) {
        res.json({
            online: false,
            error: e.message,
            modules: [],
            currentUrl: cfg.hubUrl
        });
    }
});

module.exports = router;
