const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const CONFIG_DIR = path.join(__dirname, "../../config"); // Assuming config is at root of edge folder or similar structure
const ARMING_FILE = path.join(CONFIG_DIR, "arming.json");

// Ensure config dir exists
if (!fs.existsSync(CONFIG_DIR)) {
    try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (e) { console.error("Could not create config dir", e); }
}

// Debugging helper
const { isArmed } = require("../../camera-manager/armingLogic");
const CAMS_FILE = path.join(CONFIG_DIR, "cameras.json");

// Load arming data
const loadArmingData = () => {
    try {
        if (!fs.existsSync(ARMING_FILE)) {
            return { schedules: [], assignments: {}, modes: {}, labels: {} };
        }
        const data = JSON.parse(fs.readFileSync(ARMING_FILE, "utf8"));
        if (!data.modes) data.modes = {};
        if (!data.labels) data.labels = {}; // Ensure compatibility
        return data;
    } catch (e) {
        console.error("Error loading arming data", e);
        return { schedules: [], assignments: {}, modes: {}, labels: {} };
    }
};

// Save arming data
const saveArmingData = (data) => {
    try {
        fs.writeFileSync(ARMING_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error("Error saving arming data", e);
        return false;
    }
};

// GET /arming/data - Get all data (schedules + assignments)
router.get("/data", (req, res) => {
    res.json(loadArmingData());
});

// POST /arming/schedules - Save/Update a schedule
// Body: { id: "uuid", name: "Name", matrix: [[0,1,0...], ...] }
// Or Body: full list of schedules? Better to save full list for simplicity if manageable size.
// Let's expect { schedules: [...] } and replace all.
router.post("/schedules", (req, res) => {
    const data = loadArmingData();
    const newSchedules = req.body;

    if (!Array.isArray(newSchedules)) {
        return res.status(400).json({ error: "Invalid format. Expected array of schedules." });
    }

    data.schedules = newSchedules;
    if (saveArmingData(data)) {
        res.json({ success: true, count: data.schedules.length });
    } else {
        res.status(500).json({ error: "Failed to save schedules." });
    }
});

// POST /arming/assignments - Save assignments
// Body: { camId1: "scheduleId1", camId2: "SCENARIO_1", ... }
router.post("/assignments", (req, res) => {
    const data = loadArmingData();
    const newAssignments = req.body;

    if (typeof newAssignments !== 'object') {
        return res.status(400).json({ error: "Invalid format. Expected object map." });
    }

    data.assignments = newAssignments;
    if (saveArmingData(data)) {
        res.json({ success: true, count: Object.keys(data.assignments).length });
    } else {
        res.status(500).json({ error: "Failed to save assignments." });
    }
});

// POST /arming/modes - Save mode activation states
// Body: { "scheduleId": true, "SCENARIO_1": false }
router.post("/modes", (req, res) => {
    const data = loadArmingData();
    const newModes = req.body;

    if (typeof newModes !== 'object') {
        return res.status(400).json({ error: "Invalid format. Expected object map." });
    }

    // Merge or Replace? Let's Merge to preserve other keys if partial update
    data.modes = { ...data.modes, ...newModes };

    if (saveArmingData(data)) {
        res.json({ success: true, modes: data.modes });
    } else {
        res.status(500).json({ error: "Failed to save modes." });
    }
});

// POST /arming/labels - Save scenario labels
// Body: { "SCENARIO_1": "Custom Name" }
router.post("/labels", (req, res) => {
    const data = loadArmingData();
    const newLabels = req.body;

    if (typeof newLabels !== 'object') {
        return res.status(400).json({ error: "Invalid format. Expected object map." });
    }

    data.labels = { ...data.labels, ...newLabels };

    if (saveArmingData(data)) {
        res.json({ success: true, labels: data.labels });
    } else {
        res.status(500).json({ error: "Failed to save labels." });
    }
});

router.get("/debug", (req, res) => {
    try {
        const armingConfig = loadArmingData();
        let cams = [];
        if (fs.existsSync(CAMS_FILE)) {
            cams = JSON.parse(fs.readFileSync(CAMS_FILE, "utf8"));
        }

        const now = new Date();
        const debugInfo = {
            serverTime: now.toISOString(),
            serverTimeLocal: now.toLocaleString(),
            armingConfig,
            cameras: cams.map(c => ({
                id: c.id,
                name: c.name,
                isArmed: isArmed(c),
                assignment: armingConfig.assignments[c.id],
                modeActive: armingConfig.modes[armingConfig.assignments[c.id]]
            }))
        };
        res.json(debugInfo);
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

module.exports = router;
