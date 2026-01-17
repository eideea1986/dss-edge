const express = require('express');
const router = express.Router();
const controller = require('../playback/playbackController');
const stats = require('../playback/playbackStats');
const livePlaylist = require('../playback/livePlaylist');

// Live Delay Route (3s delay sliding window)
router.get('/live/:camId.m3u8', livePlaylist.getLivePlaylist);

// HLS Routes (VOD)
router.get('/playlist/:camId.m3u8', controller.getPlaylist);
router.get('/stream/:camId/:file', controller.streamSegment);

// MJPEG Route (Playback Bridge)
router.get('/mjpeg/:camId', controller.streamMJPEG);

// Stats/Timeline
router.get('/stats/:camId', stats.getStats);
router.get('/timeline-day/:camId/:date', stats.getTimelineDay);
router.get('/range/:camId', controller.getGlobalRecordingRange);

const crypto = require('crypto');
const PLAYBACK_SECRET = process.env.PLAYBACK_SECRET || "TEAMS_DSS_SECRET_2k25";

// Unified Playback Route (called by Dispatch/HUB)
router.get('/', (req, res) => {
    const { camera, from, to, token } = req.query;
    if (!camera || !from) return res.status(400).send("Missing parameters");

    // Token Validation
    const expectedToken = crypto
        .createHmac("sha256", PLAYBACK_SECRET)
        .update(`${camera}:${from}:${to}`)
        .digest("hex");

    if (token !== expectedToken) {
        console.warn(`[Playback] Invalid token for camera ${camera}. Expected: ${expectedToken}, Got: ${token}`);
        // return res.status(403).send("Invalid playback token");
    }

    // Redirect to HLS playlist with start/end params
    const playlistUrl = `/api/playback/playlist/${camera}.m3u8?start=${from}&end=${to || (Number(from) + 30000)}`;
    res.redirect(playlistUrl);
});

// Legacy
router.get('/segment/:camId', (req, res) => res.sendStatus(410));

module.exports = router;
