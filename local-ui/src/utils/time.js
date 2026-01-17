/* Standard DSS Time Utilities using Luxon */
import { DateTime } from 'luxon';

/**
 * Returns the UTC Timestamp (ms) for a given Date ("YYYY-MM-DD") and Time ("HH:MM")
 * in the NVR's Timezone.
 * Usage: UI Click -> Backend Request.
 * timeStr format: "HH:mm" or "HH:mm:ss"
 */
export function localToUtcTs(dateStr, timeStr, timezone) {
    if (!timezone) {
        // Fallback safely if TZ not loaded yet
        return DateTime.fromISO(`${dateStr}T${timeStr}`).toMillis();
    }
    return DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: timezone }).toMillis();
}

/**
 * Returns the Epoch (ms) corresponding to 00:00:00 in the Target Timezone.
 * Usage: Setting the Timeline anchor (x=0).
 */
export function getLocalDayStart(dateStr, timezone) {
    if (!timezone) return DateTime.fromISO(dateStr).startOf('day').toMillis();
    return DateTime.fromISO(dateStr, { zone: timezone }).startOf('day').toMillis();
}

/**
 * Formats a UTC Timestamp into "HH:mm:ss" in the Target Timezone.
 * Usage: Displaying Playhead time, Debug info.
 */
export function formatLocalTime(ts, timezone) {
    if (!ts) return "--:--:--";
    const opts = timezone ? { zone: timezone } : {};
    return DateTime.fromMillis(ts, opts).toFormat('HH:mm:ss');
}

/**
 * Formats a UTC Timestamp into "yyyy-MM-dd" in the Target Timezone.
 */
export function formatLocalDate(ts, timezone) {
    if (!ts) return "";
    const opts = timezone ? { zone: timezone } : {};
    return DateTime.fromMillis(ts, opts).toFormat('yyyy-MM-dd');
}
