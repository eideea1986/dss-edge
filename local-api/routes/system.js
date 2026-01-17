const express = require('express');
const router = express.Router();
const timeController = require('../system/timeController');

// Time & Date Routes
router.get('/time', timeController.getSystemTime);
router.post('/timezone', timeController.setTimezone);
router.get('/timezones', timeController.getTimezones);

module.exports = router;
