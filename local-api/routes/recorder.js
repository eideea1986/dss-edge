const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const axios = require('axios');

const STORAGE_ROOT = path.resolve(__dirname, '../../recorder/storage');

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

module.exports = router;
