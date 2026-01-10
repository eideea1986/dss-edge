const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Load modules
const ObjectTracker = require('./modules/objectTracker');
const FalseDetectionFilter = require('./modules/falseDetectionFilter');
const EventManager = require('./modules/eventManager');
const DispatchNotifier = require('./modules/dispatchNotifier');

// Load configuration
const config = require('./config/default.json');

const app = express();
app.use(bodyParser.json());

// Logging
const logStream = fs.createWriteStream(path.join(__dirname, 'logs', 'intelligence.log'), { flags: 'a' });
const log = (msg) => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    console.log(logMsg.trim());
    logStream.write(logMsg);
};

// Initialize modules
log('Initializing AI Intelligence System...');
const tracker = new ObjectTracker(config);
const filter = new FalseDetectionFilter(config);
const eventManager = new EventManager(config);
const notifier = new DispatchNotifier(config);
log('All modules loaded successfully');

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        module: 'AI Intelligence System',
        version: '1.0.0',
        uptime: process.uptime(),
        modules: {
            tracker: tracker.isReady(),
            filter: filter.isReady(),
            eventManager: eventManager.isReady(),
            notifier: notifier.isReady()
        }
    });
});

// Main detection endpoint (receives from ai_server.py)
app.post('/api/detections', async (req, res) => {
    try {
        const { camera_id, frame_id, timestamp, detections } = req.body;

        if (!camera_id || !detections) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        log(`[${camera_id}] Frame ${frame_id}: Received ${detections.length} detections`);

        // STEP 1: Track objects (assign IDs, update trajectories)
        const trackedObjects = tracker.updateTracks(camera_id, detections, timestamp, frame_id);
        log(`[${camera_id}] Tracking: ${trackedObjects.length} objects`);

        // STEP 2: Filter false detections (stability, motion, zones)
        const validObjects = filter.filterFalseDetections(trackedObjects, camera_id);
        log(`[${camera_id}] After filtering: ${validObjects.length} valid objects`);

        // STEP 3: Generate events (with anti-spam, cooldowns)
        const events = await eventManager.processObjects(validObjects, camera_id);
        log(`[${camera_id}] Generated ${events.length} events`);

        // STEP 4: Send to Dispatch (only filtered, deduplicated events)
        if (events.length > 0) {
            await notifier.sendToDispatch(events);
            log(`[${camera_id}] Sent ${events.length} events to Dispatch`);
        }

        res.json({
            success: true,
            processed: detections.length,
            tracked: trackedObjects.length,
            valid: validObjects.length,
            events: events.length
        });

    } catch (error) {
        log(`ERROR: ${error.message}`);
        console.error('Processing error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Configuration endpoint
app.get('/api/config/:camera_id', (req, res) => {
    const cameraConfig = config.cameras && config.cameras[req.params.camera_id]
        ? config.cameras[req.params.camera_id]
        : config.default;
    res.json(cameraConfig);
});

// Statistics endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const stats = {
            tracked_objects: tracker.getActiveCount(),
            events_today: await eventManager.getEventsToday(),
            false_zones: filter.getIgnoredZonesCount(),
            uptime_seconds: Math.floor(process.uptime())
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual event trigger (for testing)
app.post('/api/test/event', async (req, res) => {
    try {
        const { camera_id, event_type } = req.body;
        const testEvent = {
            id: require('uuid').v4(),
            camera_id: camera_id || 'test_camera',
            event_type: event_type || 'manual_test',
            timestamp: new Date(),
            priority: 'normal'
        };
        await notifier.sendToDispatch([testEvent]);
        res.json({ success: true, event: testEvent });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('SIGTERM received, shutting down gracefully...');
    tracker.cleanup();
    eventManager.cleanup();
    server.close(() => {
        log('Server closed');
        process.exit(0);
    });
});

const PORT = process.env.AI_INTELLIGENCE_PORT || config.server.port || 5005;
const server = app.listen(PORT, () => {
    log(`===========================================`);
    log(`AI Intelligence System started on port ${PORT}`);
    log(`Modules loaded:`);
    log(`  ✓ Object Tracker`);
    log(`  ✓ False Detection Filter`);
    log(`  ✓ Event Manager (Anti-Spam)`);
    log(`  ✓ Dispatch Notifier`);
    log(`===========================================`);
});

module.exports = app;
