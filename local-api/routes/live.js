const express = require('express');
const router = express.Router();
const controller = require('../controllers/liveController');

router.get('/start/:cameraId', controller.startLive);
router.get('/stop/:cameraId', controller.stopLive);
router.get('/sdp', controller.getSDP);
router.post('/offer', controller.handleOffer);

module.exports = router;
