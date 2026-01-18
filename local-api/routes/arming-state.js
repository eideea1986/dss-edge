const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const fetch = require('node-fetch');
const redis = new Redis();

/**
 * EXEC-31: Arming State API
 * 
 * Provides LIVE arming state per-camera from arming service (Redis authority)
 * UI uses this to determine zone visibility and armed visualization
 */

/**
 * GET /api/arming/state
 * Returns global arming state + per-camera armed status
 */
router.get('/state', async (req, res) => {
    try {
        // Get LIVE arming state from Redis (IMPLACABLE MODE - EXEC-22)
        const armingStateStr = await redis.get('state:arming');

        if (!armingStateStr) {
            return res.json({
                armed: false,
                state: 'UNKNOWN',
                cameras: {},
                timestamp: null,
                warning: 'Arming service unreachable'
            });
        }

        const armingState = JSON.parse(armingStateStr);

        // Validate arming state structure (EXEC-22 requirement)
        if (typeof armingState.armed !== 'boolean') {
            return res.status(500).json({
                armed: false,
                state: 'FAIL',
                cameras: {},
                timestamp: armingState.timestamp || null,
                error: 'Arming state corrupted - armed field invalid'
            });
        }

        // Check staleness (EXEC-22: max 15s)
        const now = Date.now();
        const age = now - (armingState.timestamp || 0);

        if (age > 15000) {
            return res.json({
                armed: false,
                state: 'STALE',
                cameras: {},
                timestamp: armingState.timestamp,
                warning: `Arming state stale (${Math.floor(age / 1000)}s ago)`
            });
        }

        // Build per-camera arming status
        const cameras = {};
        const zones = armingState.zones || {};

        // If globally armed, check which cameras have zones assigned
        if (armingState.armed) {
            for (const [zoneId, cameraIds] of Object.entries(zones)) {
                if (Array.isArray(cameraIds)) {
                    cameraIds.forEach(camId => {
                        if (!cameras[camId]) {
                            cameras[camId] = {
                                armed: true,
                                zones: []
                            };
                        }
                        cameras[camId].zones.push(zoneId);
                    });
                }
            }
        }

        // Response
        res.json({
            armed: armingState.armed,
            state: 'OK',
            cameras,
            zones: armingState.zones || {},
            schedules: armingState.schedules || {},
            timestamp: armingState.timestamp,
            age: age
        });

    } catch (error) {
        console.error('[Arming State API] Error:', error);
        res.status(500).json({
            armed: false,
            state: 'ERROR',
            cameras: {},
            timestamp: null,
            error: error.message
        });
    }
});

/**
 * GET /api/arming/camera/:cameraId
 * Returns arming state for a single camera
 */
router.get('/camera/:cameraId', async (req, res) => {
    try {
        const { cameraId } = req.params;

        const armingStateStr = await redis.get('state:arming');

        if (!armingStateStr) {
            return res.json({
                cameraId,
                armed: false,
                zones: [],
                state: 'UNKNOWN',
                warning: 'Arming service unreachable'
            });
        }

        const armingState = JSON.parse(armingStateStr);

        // Check global armed state
        if (!armingState.armed) {
            return res.json({
                cameraId,
                armed: false,
                zones: [],
                state: 'DISARMED',
                timestamp: armingState.timestamp
            });
        }

        // Find zones for this camera
        const cameraZones = [];
        const zones = armingState.zones || {};

        for (const [zoneId, cameraIds] of Object.entries(zones)) {
            if (Array.isArray(cameraIds) && cameraIds.includes(cameraId)) {
                cameraZones.push(zoneId);
            }
        }

        res.json({
            cameraId,
            armed: cameraZones.length > 0,
            zones: cameraZones,
            state: 'OK',
            timestamp: armingState.timestamp
        });

    } catch (error) {
        console.error(`[Arming State API] Error for camera ${req.params.cameraId}:`, error);
        res.status(500).json({
            cameraId: req.params.cameraId,
            armed: false,
            zones: [],
            state: 'ERROR',
            error: error.message
        });
    }
});

/**
 * POST /api/arming/arm
 * Arm the system (delegates to arming service)
 */
router.post('/arm', async (req, res) => {
    try {
        // Call arming service HTTP API
        const armingServiceUrl = 'http://127.0.0.1:9100/arm';
        const response = await fetch(armingServiceUrl, { method: 'POST' });

        if (response.ok) {
            // EXEC-32: Real-time Event Emission
            if (req.app.broadcastEvent) {
                req.app.broadcastEvent('ARMING_STATE_CHANGED', { armed: true });
            }
            res.json({ success: true, message: 'System armed' });
        } else {
            res.status(response.status).json({
                success: false,
                error: 'Failed to arm system'
            });
        }
    } catch (error) {
        console.error('[Arming State API] Arm error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/arming/disarm
 * Disarm the system (delegates to arming service)
 */
router.post('/disarm', async (req, res) => {
    try {
        const armingServiceUrl = 'http://127.0.0.1:9100/disarm';
        const response = await fetch(armingServiceUrl, { method: 'POST' });

        if (response.ok) {
            // EXEC-32: Real-time Event Emission
            if (req.app.broadcastEvent) {
                req.app.broadcastEvent('ARMING_STATE_CHANGED', { armed: false });
            }
            res.json({ success: true, message: 'System disarmed' });
        } else {
            res.status(response.status).json({
                success: false,
                error: 'Failed to disarm system'
            });
        }
    } catch (error) {
        console.error('[Arming State API] Disarm error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
