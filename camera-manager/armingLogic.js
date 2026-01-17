const isArmed = (cam) => {
    if (!cam || !cam.enabled) return false;

    // AI Enabled switch
    if (cam.ai_server && cam.ai_server.enabled === false) return false;

    // Manual Arming Override (UI Button)
    // If arming property exists and is explicitly false, disarm.
    // If property doesn't exist, assume armed by default or check schedule.

    // Check Config Structure compatible with Settings.js
    // Usually: cam.arming_state = 'ARMED' | 'DISARMED' | 'SCHEDULE'

    if (cam.arming_state === 'DISARMED') return false;
    if (cam.arming_state === 'ARMED') return true;

    // If SCHEDULE (or default)
    if (cam.schedules && cam.schedules.ai) {
        // Simple Schedule Check
        // Format: "Mo,Tu,We|08:00-18:00" or similar.
        // For MVP, if schedule object exists, return true (assume active).
        // Implementing full cron parser here is risky without libraries.
        // TODO: Implement time check based on cam.schedules
        return true;
    }

    // Default to ARMED if no specific blocking condition
    return true;
};

module.exports = { isArmed };
