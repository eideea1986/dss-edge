const express = require('express');
const router = express.Router();

// FIX: Centralized Store Import
const cameraStore = require('../store/cameraStore');
const addCamera = require('../../camera-manager/addCamera');

// GET /cameras - List all
router.get("/", (req, res) => {
    try {
        const list = cameraStore.list();
        res.json(list);
    } catch (e) {
        // Debugging info
        console.error("Camera List Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// GET /cameras/config - Alias for Legacy
router.get("/config", (req, res) => {
    try {
        const list = cameraStore.list();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Quick Add Alias (Fixing UI 404)
router.post("/quick-add", async (req, res) => {
    try {
        const camera = await addCamera(req.body);
        res.status(201).json(camera);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Wizard Probe - Automatic Discovery
router.post("/probe", async (req, res) => {
    try {
        const DeviceFactory = require('../../camera-manager/adapters/DeviceFactory');
        const probeResults = await DeviceFactory.smartProbe(req.body);
        if (probeResults && probeResults.config) {
            res.json(probeResults.config);
        } else {
            res.status(404).json({ error: "Camera not found or unsupported" });
        }
    } catch (e) {
        console.error("[Camera Route] Probe Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// POST /cameras - Add new camera

// POST /cameras/add - UI Wizard Alias
router.post("/add", async (req, res) => {
    try {
        const cam = await addCamera(req.body);
        res.json(cam);
    } catch (e) {
        console.error("Camera Add Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.post("/", async (req, res) => {
    try {
        const cam = await addCamera(req.body);
        res.status(201).json(cam);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /cameras/config - Batch Update
router.post("/config", (req, res) => {
    if (Array.isArray(req.body)) {
        try {
            req.body.forEach(c => cameraStore.add(c));
            res.sendStatus(200);
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        res.status(400).json({ error: "Batch config requires array" });
    }
});

const decoderManager = require('../../camera-manager/decoderManager');
const go2rtcUtils = require('../../camera-manager/go2rtcUtils');

// DELETE /cameras/:id
const deleteHandler = async (req, res) => {
    try {
        const id = req.params.id;
        console.log(`[API] DELETE Request. Incoming ID='${id}' URL='${req.url}'`);

        // Debug Store keys
        const keys = cameraStore.list().map(c => c.id);
        console.log(`[API] Available IDs in Store: ${keys.join(', ')}`);

        // 1. Stop active decoders
        if (decoderManager && decoderManager.stopDecoder) {
            decoderManager.stopDecoder(id);
        }

        // 2. Remove from Store
        const success = cameraStore.delete(id);
        console.log(`[API] Store delete result for '${id}': ${success}`);

        if (success) {
            // 3. Update Go2RTC
            try {
                const allCameras = cameraStore.list();
                await go2rtcUtils.generateConfig(allCameras);
                console.log(`[API] Go2RTC updated.`);
            } catch (err) { console.warn(err.message); }
            res.sendStatus(200);
        } else {
            console.warn(`[API] 404 Not Found. ID '${id}' not in store.`);
            res.status(404).json({ error: "Camera not found", receivedId: id, availableIds: keys });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
};

// Catch-all specific debug route
router.delete("/config/:id", deleteHandler);
router.delete("/:id", deleteHandler);


module.exports = router;
