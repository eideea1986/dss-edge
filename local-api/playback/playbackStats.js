const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

/**
 * Shared DB Opener
 */
const getDatabase = (camId) => {
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return null;
    return new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
};

/**
 * ENTERPRISE TIMELINE AGGREGATOR
 * Provides segment bitmask/list for a specific 24h window.
 */
const getTimelineDay = async (req, res) => {
    const { camId, date } = req.params;

    try {
        // Robust Date Calculation (Enforce Local Timeline Bounds)
        const dateParts = date.split('-').map(Number);
        if (dateParts.length < 3) throw new Error("Invalid date format (Expect YYYY-MM-DD)");

        // Start of day in Server Local Time
        const dayStart = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 0, 0, 0);
        const dayStartTs = dayStart.getTime();
        const dayEndTs = dayStartTs + 86400000;

        const db = getDatabase(camId);
        if (!db) {
            return res.json({
                dayStart: dayStartTs,
                segments: [],
                playback_state: "NO_DATA",
                state_reason: "Cameră neconfigurată sau fără istoric."
            });
        }

        // Query Strategy: All segments that overlap with this 24h window
        const query = `SELECT file, start_ts, end_ts FROM segments 
                       WHERE end_ts > ? AND start_ts < ? 
                       ORDER BY start_ts ASC`;

        db.all(query, [dayStartTs, dayEndTs], (err, rows) => {
            db.close();
            if (err) {
                console.error(`[Timeline] DB Error [${camId}]:`, err.message);
                return res.status(500).json({ error: "Eroare la accesarea bazei de date." });
            }

            const segments = rows.map(r => ({
                start_ts: Math.max(r.start_ts, dayStartTs),
                end_ts: Math.min(r.end_ts, dayEndTs),
                file: r.file
            }));

            // Meta-State Detection
            const indexReady = fs.existsSync("/run/dss/index.ready");
            let state = "OK";
            let reason = "";

            if (!indexReady) {
                state = "INDEX_REBUILDING";
                reason = "Reconstruire index în curs...";
            } else if (segments.length === 0) {
                state = "TIME_MISMATCH";
                reason = "Nu există date pentru ziua selectată.";
            }

            res.json({
                camId,
                date,
                dayStart: dayStartTs,
                dayEnd: dayEndTs,
                segments,
                playback_state: state,
                state_reason: reason
            });
        });
    } catch (e) {
        console.error(`[Timeline] Logic Error [${camId}]:`, e.message);
        return res.status(400).json({ error: e.message });
    }
};

/**
 * FAST GLOBAL RANGE LOOKUP
 * Precise start/end of all recording history for a camera.
 */
const getGlobalRange = (camId) => {
    return new Promise((resolve) => {
        const db = getDatabase(camId);
        if (!db) return resolve({ start: null, end: null });

        const query = `SELECT MIN(start_ts) as start, MAX(end_ts) as end FROM segments`;
        db.get(query, [], (err, row) => {
            db.close();
            if (err || !row) return resolve({ start: null, end: null });
            resolve({
                start: row.start,
                end: row.end
            });
        });
    });
};

const getStats = (req, res) => res.json({ first: null, last: null });

module.exports = { getStats, getTimelineDay, getGlobalRange };
