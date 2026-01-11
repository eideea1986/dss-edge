const express = require('express');
const router = express.Router();
const controller = require('../playback/playbackController');
const stats = require('../playback/playbackStats');

// HLS Routes (The Solution)
router.get('/playlist/:camId.m3u8', controller.getPlaylist);
router.get('/stream/:camId/:file', controller.streamSegment);

// Legacy/Stats routes (Keep for Timeline UI)
router.get('/stats/:camId', stats.getStats);
router.get('/timeline-day/:camId/:date', stats.getTimelineDay);

// Legacy Segment Route (Optional, can remove later)
router.get('/segment/:camId', (req, res) => res.sendStatus(410)); // Gone

module.exports = router;
