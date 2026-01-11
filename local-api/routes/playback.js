const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const playback = require('../playback/playbackController');

const STORAGE_ROOT = path.resolve(__dirname, '../../storage');

/**
 * POST /playback/start
 * Start playback session with HLS output
 */
router.post('/start', async (req, res) => {
    const { camId, from, to, speed = 1.0 } = req.body;

    if (!camId || !from || !to) {
        return res.status(400).json({ error: 'camId, from, and to are required' });
    }

    const archivePath = path.join(STORAGE_ROOT, camId);
    const indexDb = path.join(archivePath, 'index.db');

    if (!fs.existsSync(indexDb)) {
        return res.status(404).json({ error: 'No recordings found for this camera' });
    }

    try {
        const result = await playback.play(camId, from, to, speed);

        res.json({
            success: true,
            camId,
            ...result
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /playback/stop
 * Stop active playback session
 */
router.post('/stop', async (req, res) => {
    const { camId } = req.body;
    const stopped = await playback.stop(camId);

    res.json({
        success: true,
        wasStopped: stopped
    });
});

/**
 * GET /playback/status
 * Get status of playback
 */
router.get('/status', async (req, res) => {
    const status = await playback.status();
    res.json(status);
});

/**
 * GET /playback/timeline/:camId
 * ENTERPRISE TIMELINE - SQL with OVERLAP query
 */
router.get('/timeline/:camId', (req, res) => {
    const { camId } = req.params;
    const from = parseInt(req.query.from) || (Date.now() - 24 * 60 * 60 * 1000);
    const to = parseInt(req.query.to) || Date.now();

    const sqlite3 = require('sqlite3');
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');

    if (!fs.existsSync(dbPath)) {
        return res.json({ segments: [], from, to, count: 0 });
    }

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    // CRITICAL FIX: Use OVERLAP (end_ts > from AND start_ts < to)
    // Filter corrupt timestamps (positive, reasonable range)
    db.all(
        `SELECT start_ts, CASE WHEN end_ts = 0 THEN ? ELSE end_ts END as end_ts 
         FROM segments 
         WHERE end_ts > ? 
           AND start_ts < ?
           AND start_ts > 0 
           AND start_ts < ?
         ORDER BY start_ts ASC`,
        [Date.now(), from, to, to * 2],
        (err, segments) => {
            db.close();

            if (err) {
                console.error('[Timeline] SQL Error:', err);
                return res.status(500).json({ error: err.message });
            }

            if (!segments || segments.length === 0) {
                return res.json({ segments: [], from, to, count: 0 });
            }

            // Normalize to 0-1 for UI timeline bar
            const span = to - from;
            const normalized = segments.map(seg => ({
                start_ts: seg.start_ts,
                end_ts: seg.end_ts,
                s: Math.max(0, Math.min(1, (seg.start_ts - from) / span)),
                e: Math.max(0, Math.min(1, (seg.end_ts - from) / span))
            }));

            console.log(`[Timeline] ${camId}: ${normalized.length} segments in range`);

            res.json({
                segments: normalized,
                from,
                to,
                count: normalized.length
            });
        }
    );
});

/**
 * GET /playback/timeline-day/:camId/:date
 * ENTERPRISE TIMELINE - Fetch ALL segments for a specific day (00:00-24:00)
 * Date format: YYYY-MM-DD
 */

// GET DAYS WITH RECORDINGS (For Calendar)
router.get('/calendar-month/:camId/:year/:month', async (req, res) => {
    const { camId, year, month } = req.params; // month is 1-12
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');

    if (!fs.existsSync(dbPath)) return res.json({ days: [] });

    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(dbPath);

    // Range: Start of Month -> NOW (Cap at current time)
    const startOfMonth = new Date(year, month - 1, 1).getTime();
    const endOfMonth = new Date(year, month, 1).getTime();
    const now = Date.now();

    // STRICT: Don't look into the future
    const searchEnd = Math.min(endOfMonth, now);

    const sql = `SELECT start_ts FROM segments WHERE start_ts >= ? AND start_ts <= ?`; // LTE NOW

    db.all(sql, [startOfMonth, searchEnd], (err, rows) => {
        db.close();
        if (err) {
            console.error(err);
            return res.json({ days: [] });
        }

        const daysSet = new Set();
        rows.forEach(r => {
            const d = new Date(r.start_ts);
            // Double sanity check: Don't allow future days
            if (d.getTime() <= now) {
                daysSet.add(d.getDate());
            }
        });

        res.header('Cache-Control', 'no-store');
        res.json({
            serverNow: now,
            serverDate: new Date(now).toString(),
            days: Array.from(daysSet).sort((a, b) => a - b)
        });
    });
});
router.get('/timeline-day/:camId/:date', (req, res) => {
    const { camId, date } = req.params;

    // Calculate Day Start (Local Time 00:00)
    // Manually parse YYYY-MM-DD to avoid UTC shifts
    const [y, m, d] = date.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const dayEnd = dayStart + 86400000;

    // REALITY CHECK: Cap queries at NOW
    const now = Date.now();

    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return res.json({ segments: [], dayStart });

    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(dbPath);

    // SANITY FILTER: Ignore garbage (1970) and future dates (drift)
    // 1700000000000 = Nov 2023
    const MIN_VALID_TS = 1700000000000;
    const MAX_VALID_TS = now + 86400000; // Allow 1 day drift max

    db.all(
        `SELECT start_ts, CASE WHEN end_ts = 0 THEN ? ELSE end_ts END as end_ts 
         FROM segments 
         WHERE end_ts > ? 
           AND start_ts < ?
           AND start_ts > ? 
           AND start_ts < ?
         ORDER BY start_ts ASC`,
        [now, dayStart, dayEnd, MIN_VALID_TS, MAX_VALID_TS],

        (err, rows) => {
            db.close();
            if (err) return res.status(500).json({ error: err.message });

            const cleanRows = rows.map(r => {
                if (r.end_ts > now) r.end_ts = now;
                return r;
            });

            res.json({
                dayStart,
                segments: cleanRows
            });
        }
    );
});

/**
 * GET /playback/stats/:camId
 * Fetch first and last recording timestamps with SANITY FILTER
 */
router.get('/stats/:camId', (req, res) => {
    const { camId } = req.params;
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');

    if (!fs.existsSync(dbPath)) {
        return res.json({ first: null, last: null });
    }

    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    const now = Date.now();
    const MIN_VALID_TS = 1700000000000;
    const MAX_VALID_TS = now + 86400000;

    const sql = `
        SELECT 
            MIN(start_ts) as first,
            MAX(start_ts) as last
        FROM segments
        WHERE start_ts > ? AND start_ts < ?
    `;

    db.get(sql, [MIN_VALID_TS, MAX_VALID_TS], (err, row) => {
        db.close();
        if (err || !row) return res.json({ first: null, last: null });

        // CLAMP: Physically, we cannot have recordings in the future
        let last = row.last;
        if (last > now) last = now;

        res.json({
            first: row.first,
            last: last
        });
    });
});




/**
 * GET /playback/stream/:camId
 * Direct video stream for HTML5 player (Transcoded)
 */
router.get('/stream/:camId', playback.startPlayback);

module.exports = router;

