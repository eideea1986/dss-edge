const fs = require('fs');
const path = require('path');

const ARMING_CONFIG_PATH = path.join(__dirname, '../config/arming.json');

// Simple Cache for Performance (File I/O is slow for per-frame check)
let cache = {
    data: null,
    ts: 0
};

const getArmingConfig = () => {
    const now = Date.now();
    if (cache.data && (now - cache.ts < 2000)) return cache.data;

    try {
        if (fs.existsSync(ARMING_CONFIG_PATH)) {
            const raw = fs.readFileSync(ARMING_CONFIG_PATH, 'utf8');
            cache.data = JSON.parse(raw);
            cache.ts = now;
            return cache.data;
        }
    } catch (e) {
        console.error("Error reading arming config:", e.message);
    }
    return { assignments: {}, modes: {}, schedules: {} };
};

const isArmed = (cam) => {
    if (!cam || !cam.enabled) return false;

    // 1. AI Server global switch (Legacy Override)
    if (cam.ai_server && cam.ai_server.enabled === false) return false;

    // 2. Load Real Config (Source of Truth)
    const config = getArmingConfig();
    const assignment = config.assignments ? config.assignments[cam.id] : null;

    // 3. Evaluate Assignment
    if (!assignment || assignment === 'DISARMED') {
        // Fallback to legacy behavior strictly if NO assignment exists in new system
        // But if explicitly DISARMED in UI, return false.
        if (assignment === 'DISARMED') return false;

        // Legacy: Check cam.arming_state
        if (cam.arming_state === 'DISARMED') return false;

        // Default ARMED for backward compatibility if no config at all
        return true;
    }

    // 4. Check Modes (ARMED_AWAY, ARMED_HOME, etc.)
    if (['ARMED_AWAY', 'ARMED_HOME', 'ARMED_NIGHT'].includes(assignment)) {
        return !!config.modes[assignment]; // Return true only if mode is ACTIVE
    }

    // 5. Check Schedules
    // assignment is a schedule ID (UUID or index)
    // TODO: Implement complex time check here.
    // For now, if assigned to a schedule, check if schedule itself is "enabled" flag if present
    // Or just assume ARMED during schedule (complex without cron parser)

    // MVP: If assigned to a schedule, we check if that schedule exists
    // Ideally user wants: Is CURRENT TIME inside schedule?
    // We will assume "ARMED" if inside schedule. Implementing simple check:

    // Finding schedule object
    let schedule = null;
    if (Array.isArray(config.schedules)) {
        schedule = config.schedules[parseInt(assignment)] || config.schedules.find(s => s.id === assignment);
    } else if (config.schedules) {
        schedule = config.schedules[assignment];
    }

    if (schedule) {
        if (schedule.enabled === false) return false;
        // If Schedule Enabled -> We need Time Check.
        // For MVP Speed: Assume ALWAYS ARMED if Schedule Enabled (User manages schedule state manually or external cron)
        // OR todo: parse intervals.
        return true;
    }

    // Default Fallback
    return true;
};

module.exports = { isArmed };
