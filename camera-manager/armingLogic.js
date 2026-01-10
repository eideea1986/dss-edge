const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, "camera_debug.log");

function logDebug(msg) {
    try {
        const time = new Date().toISOString();
        if (msg.includes("Skipped")) return; // Reduce spam
        fs.appendFileSync(logFile, `[${time}] [ARMING] ${msg}\n`);
    } catch (e) { }
}

const ARMING_FILE = path.join(__dirname, "../config/arming.json");

let cachedArmingData = null;
let lastReadTime = 0;

function loadArmingData() {
    const now = Date.now();
    // Cache for 2 seconds to avoid excessive disk I/O in loop
    if (cachedArmingData && (now - lastReadTime < 2000)) {
        return cachedArmingData;
    }

    try {
        if (fs.existsSync(ARMING_FILE)) {
            const data = fs.readFileSync(ARMING_FILE, "utf8");
            cachedArmingData = JSON.parse(data);
            if (!cachedArmingData.modes) cachedArmingData.modes = {};
            lastReadTime = now;
            return cachedArmingData;
        }
    } catch (e) { console.error("Arming Read Error:", e.message); }

    return { schedules: [], assignments: {}, modes: {} };
}

function isArmed(camera) {
    // 1. Check Global Enable (Hardware Switch / AI Switch)
    // Relaxed Logic: If explicitly False, return false. If True or Undefined, allow Schedule to decide.
    if (camera.aiEnabled === false) return false;
    if (camera.ai_server && camera.ai_server.enabled === false) return false;

    // 2. Load Central Arming Config
    const armingConfig = loadArmingData();
    const assignment = armingConfig.assignments[camera.id];

    // Default to Disarmed if no assignment? Or default to Always?
    // User requested explicit assignment. If NOT assigned, assume DISARMED to save CPU.
    if (!assignment) {
        return false;
    }
    if (assignment === "DISARMED") {
        return false;
    }

    // 3. Logic Check

    // CASE A: Scenario / Mode / Global Switch
    // If the assignment matches a defined "Mode" (e.g. ARMED_AWAY, SCENARIO_1), check its status.
    if (armingConfig.modes[assignment] !== undefined) {
        return !!armingConfig.modes[assignment];
    }

    if (assignment.startsWith("SCENARIO_")) {
        // Fallback for scenarios not explicitly initialized in modes? 
        // Typically handled by above, but keeping for safety.
        return !!armingConfig.modes[assignment];
    }

    // CASE B: Schedule (Time based)
    // Schedules are "Active" if the current time matches the schedule. 
    // We do NOT require a "global toggle" for the schedule ID itself (unless user wants that feature).
    // Assuming Schedules are always evaluated if assigned.

    let schedule = null;
    if (Array.isArray(armingConfig.schedules)) {
        schedule = armingConfig.schedules.find(s => s.id === assignment);
    } else if (armingConfig.schedules) {
        schedule = armingConfig.schedules[assignment];
    }

    if (!schedule) {
        // logDebug(`[${camera.id}] Schedule ${assignment} not found.`);
        return false;
    }

    // Check if Schedule is explicitly disabled
    if (schedule.enabled === false) {
        return false;
    }

    const now = new Date();
    const jsDay = now.getDay(); // 0=Sun
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon, 6=Sun
    const hour = now.getHours();

    // Support "slots" format (Array of active hours: [0, 1, 8, 9...])
    // The UI saves slots with keys "0".."6"
    if (schedule.slots) {
        const daySlots = schedule.slots[dayIdx.toString()];
        if (Array.isArray(daySlots)) {
            return daySlots.includes(hour);
        }
    }

    // Support Legacy "matrix" format (48 blocks)
    if (schedule.matrix && schedule.matrix[dayIdx]) {
        const min = now.getMinutes();
        const blockIdx = (hour * 2) + (min >= 30 ? 1 : 0);
        return !!schedule.matrix[dayIdx][blockIdx];
    }

    return false;
}

module.exports = { isArmed };
