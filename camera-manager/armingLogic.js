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

const isTimeInSchedule = (schedule) => {
    if (!schedule || schedule.enabled === false) return false;

    // Support for 7x48 bitmask matrix (30min slots)
    if (schedule.matrix) {
        const now = new Date();
        const day = now.getDay(); // 0-6
        const slot = Math.floor(now.getHours() * 2) + Math.floor(now.getMinutes() / 30); // 0-47

        const dayMatrix = schedule.matrix[day.toString()] || schedule.matrix[day] || (Array.isArray(schedule.matrix) ? schedule.matrix[day] : null);
        if (dayMatrix && (dayMatrix[slot] === 1 || dayMatrix[slot] === true)) {
            return true;
        }
    }

    // Support for intervals array (Fallback)
    if (schedule.intervals && Array.isArray(schedule.intervals)) {
        const now = new Date();
        const day = now.getDay();
        const time = now.getHours() * 100 + now.getMinutes();

        return schedule.intervals.some(inv => {
            const invDay = parseInt(inv.day);
            if (isNaN(invDay) || invDay === day) {
                const start = parseInt(inv.start.replace(':', ''));
                const end = parseInt(inv.end.replace(':', ''));
                return time >= start && time <= end;
            }
            return false;
        });
    }

    // Default: If schedule enabled but no matrix/intervals, treat as always armed
    return true;
};

const getEffectiveState = (camId, camerasConfig = []) => {
    const config = getArmingConfig();
    const cam = camerasConfig.find(c => c.id === camId) || { id: camId, enabled: true };

    if (!cam.enabled) return { armed: false, zones: [] };

    const assignment = config.assignments ? config.assignments[camId] : null;

    // 1. Hard Constants
    if (assignment === 'DISARMED') return { armed: false, zones: [] };
    if (assignment === 'ALWAYS') return { armed: true, zones: (config.zones?.[camId] || []) };

    // 2. Global Modes & Scenarios
    const scenarios = ['ARMED_AWAY', 'ARMED_HOME', 'ARMED_NIGHT', 'SCENARIO_1', 'SCENARIO_2', 'SCENARIO_3'];
    if (scenarios.includes(assignment)) {
        const isModeActive = !!config.modes[assignment];
        return { armed: isModeActive, zones: isModeActive ? (config.zones?.[camId] || []) : [] };
    }

    // 3. Schedules (Lookup by ID or Index)
    let schedule = null;
    if (Array.isArray(config.schedules)) {
        // Try ID first
        schedule = config.schedules.find(s => s.id === assignment);
        // Fallback to Index if assignment is numeric string
        if (!schedule && assignment !== null && /^\d+$/.test(assignment)) {
            schedule = config.schedules[parseInt(assignment)];
        }
    }

    if (schedule) {
        const scheduleActive = isTimeInSchedule(schedule);

        // Mode Linkage (The "Follow" logic)
        let modeActive = true;
        if (schedule.linkedMode && config.modes) {
            modeActive = !!config.modes[schedule.linkedMode];
        }

        const effectivelyArmed = scheduleActive && modeActive;
        return {
            armed: effectivelyArmed,
            zones: effectivelyArmed ? (config.zones?.[camId] || []) : [],
            reason: !scheduleActive ? 'SCHEDULE_INACTIVE' : (!modeActive ? 'MODE_INACTIVE' : 'OK')
        };
    }

    // 4. Default Fallback (Legacy)
    const legacyArmed = cam.arming_state !== 'DISARMED';
    return { armed: legacyArmed, zones: legacyArmed ? (config.zones?.[camId] || []) : [] };
};

module.exports = { isArmed: (cam) => getEffectiveState(cam.id, [cam]).armed, getEffectiveState };
