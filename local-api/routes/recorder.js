const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const axios = require('axios');

const STORAGE_ROOT = path.resolve(__dirname, '../../storage');

const { PlaybackSession } = require('../playback/PlaybackSession');
const { createSession, getSession } = require('../playback/PlaybackManager');
const crypto = require('crypto');

// 1. Start a Session (Orchestrator)
router.get('/playback/session', async (req, res) => {
    const { camId, startTs, speed = 1 } = req.query;
    if (!camId || !startTs) return res.status(400).send("camId and startTs required");

    const streamName = `playback_${camId}`;
    const sessionId = `sess_${camId}_${Date.now()}`;

    // Create Session Object (idle state)
    const session = new PlaybackSession(sessionId, camId);
    createSession(sessionId, session);

    // Build the HTTP Source URL that Go2RTC will consume
    // This calls back into OUR Express server
    const port = req.socket.localPort || 3000;
    const sourceUrl = `http://127.0.0.1:${port}/recorder/stream/${sessionId}?startTs=${startTs}&speed=${speed}`;

    console.log(`[Playback] Initializing session ${sessionId} -> ${sourceUrl}`);

    try {
        // A. Cleanup old stream
        try { await axios.delete(`http://127.0.0.1:1984/api/streams?name=${streamName}`); } catch (e) { }

        // B. Register new stream pointing to our Node endpoint
        // This is generic HTTP source for go2rtc (ffmpeg/cvlc compatible)
        await axios.put(`http://127.0.0.1:1984/api/streams?name=${streamName}&src=${encodeURIComponent(sourceUrl)}`);

        console.log(`[Playback] Registered stream ${streamName} OK`);

        res.json({
            stream: streamName,
            sessionId: sessionId,
            webrtc_url: `webrtc?src=${streamName}`
        });
    } catch (e) {
        console.error("Go2RTC Error:", e.message);
        res.status(500).send("Go2RTC Registration Failed");
    }
});

// 2. The Actual Stream Endpoint (Consumed by Go2RTC)
router.get('/stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = getSession(sessionId);

    if (!session) {
        return res.status(404).send("Session not found");
    }

    const { startTs, speed } = req.query;
    console.log(`[Playback] Streaming request for ${sessionId}, startTs=${startTs}`);

    // This triggers the heavy lifting (FFmpeg transcoding)
    // Pipes MPEG-TS directly to the response (Go2RTC)
    session.start({
        startTs: parseInt(startTs),
        speed: parseFloat(speed || 1)
    }, res);
});

// Helper for days/timeline (unchanged)
router.get('/days', (req, res) => {
    const days = new Set();
    try {
        fs.readdirSync(STORAGE_ROOT).forEach(c => {
            const p = path.join(STORAGE_ROOT, c);
            if (fs.statSync(p).isDirectory()) {
                fs.readdirSync(p).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).forEach(d => days.add(d));
            }
        });
    } catch (e) { }
    res.json(Array.from(days).sort().reverse());
});

router.get('/timeline/:camId/:date', (req, res) => {
    const { camId, date } = req.params;
    // Date format: YYYY-MM-DD

    // STRATEGY 1: Filesystem Scan (New NVR)
    try {
        const [y, m, d] = date.split('-');
        const dayDir = path.join(STORAGE_ROOT, camId, y, m, d);

        if (fs.existsSync(dayDir)) {
            const files = fs.readdirSync(dayDir).filter(f => f.endsWith('.mp4'));
            const segments = [];

            files.forEach(f => {
                try {
                    const parts = f.replace('.mp4', '').split('-'); // HH-MM-SS
                    if (parts.length < 3) return;

                    const h = parseInt(parts[0]);
                    const min = parseInt(parts[1]);
                    const s = parseInt(parts[2]);

                    // Create date in LOCAL time implicitly if treating string as parts? 
                    // No, we need consistent UTC/Server time.
                    // The server OS handles file creation. The filenames are HH-MM-SS.
                    // We construct the date object.

                    const segDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), h, min, s, 0);
                    const start = segDate.getTime();
                    const end = start + 60000; // 60s segment default
                    segments.push({ start, end });
                } catch (e) { }
            });

            segments.sort((a, b) => a.start - b.start);

            // Merge continuous segments for visualization
            const ranges = [];
            let curS = null, curE = null;

            segments.forEach(seg => {
                if (curS === null) {
                    curS = seg.start;
                    curE = seg.end;
                } else {
                    // If gap < 3 seconds, merge
                    if (seg.start - curE < 3000) {
                        curE = Math.max(curE, seg.end);
                    } else {
                        ranges.push({ start: curS, end: curE });
                        curS = seg.start;
                        curE = seg.end;
                    }
                }
            });
            if (curS !== null) ranges.push({ start: curS, end: curE });

            return res.json(ranges);
        }
    } catch (e) {
        console.error("Timeline FS Scan Error:", e);
        // Continue to fallback
    }

    // STRATEGY 2: Legacy SQLite (Fallback)
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return res.json([]);
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    const dayStart = new Date(date + "T00:00:00Z").getTime();
    const dayEnd = dayStart + 86400000;
    db.all(`SELECT start_ts, end_ts FROM segments WHERE type='segment' AND start_ts >= ? AND start_ts < ? ORDER BY start_ts ASC`, [dayStart, dayEnd], (err, rows) => {
        db.close();
        if (err || !rows) return res.json([]);
        const ranges = [];
        let curS = null, curE = null;
        rows.forEach(row => {
            if (curS === null) { curS = row.start_ts; curE = row.end_ts; }
            else {
                if (row.start_ts - curE < 3000) curE = Math.max(curE, row.end_ts);
                else { ranges.push({ start: curS, end: curE }); curS = row.start_ts; curE = row.end_ts; }
            }
        });
        if (curS !== null) ranges.push({ start: curS, end: curE });
        res.json(ranges);
    });
});

router.get('/health', (req, res) => {
    try {
        const recorderService = require('../services/recorderService');
        res.json(recorderService.getHealth());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Archive Settings UI Endpoint
router.get('/status', (req, res) => {
    const { exec } = require('child_process');

    // Get storage info
    exec(`df -h ${STORAGE_ROOT}`, (err, stdout) => {
        let storage = { usedPercent: 0, avail: 'N/A', used: 'N/A', total: 'N/A' };

        if (!err && stdout) {
            try {
                const lines = stdout.trim().split('\n');
                if (lines.length >= 2) {
                    const parts = lines[1].trim().split(/\s+/);
                    if (parts.length >= 5) {
                        storage = {
                            usedPercent: parseInt(parts[4].replace('%', '')),
                            avail: parts[3],
                            used: parts[2],
                            total: parts[1]
                        };
                    }
                }
            } catch (e) {
                console.error('Storage parse error:', e);
            }
        }

        // Get camera recording status
        const cameras = {};
        try {
            if (fs.existsSync(STORAGE_ROOT)) {
                const camDirs = fs.readdirSync(STORAGE_ROOT).filter(d => {
                    const p = path.join(STORAGE_ROOT, d);
                    return fs.statSync(p).isDirectory();
                });

                camDirs.forEach(camId => {
                    // Check if camera has recent recordings
                    const camPath = path.join(STORAGE_ROOT, camId);
                    let hasMain = false;
                    let hasSub = false;

                    try {
                        // Simple heuristic: check if directories exist
                        // In real implementation, you'd check for recent files
                        const years = fs.readdirSync(camPath).filter(y => /^\d{4}$/.test(y));
                        if (years.length > 0) {
                            hasMain = true; // Assume main stream if recordings exist
                        }
                    } catch (e) {
                        // Ignore errors for individual cameras
                    }

                    cameras[camId] = {
                        main: hasMain,
                        sub: hasSub
                    };
                });
            }
        } catch (e) {
            console.error('Camera status error:', e);
        }

        res.json({
            storage,
            cameras
        });
    });
});

router.post('/retention/force', async (req, res) => {
    try {
        const retention = require('../../retention/retention_engine');
        console.log("[API] Forcing Retention Run...");
        await retention.retentionRun();
        res.json({ success: true, message: "Retention triggered" });
    } catch (e) {
        console.error("Retention Force Error:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
