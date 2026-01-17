const fs = require('fs');
const path = require('path');
// const { spawn } = require('child_process'); // DISABLED
const cameraStore = require('../store/cameraStore');

// C++ Recorder Binary - DEPRECATED PATH in this service
// const RECORDER_BIN = '/opt/dss-edge/recorder_cpp/build/recorder';
const STORAGE_ROOT = '/opt/dss-edge/storage';

class RecorderService {
    constructor() {
        this.processes = new Map();
        this.health = new Map();

        // Polling removed - managed by dss-recorder service (Orchestrator)
    }

    sync() {
        // NO-OP: Recording managed by external generic orchestrator
        return;
    }

    monitorHealth(camId) {
        // NO-OP
    }

    getHealth() {
        // Read health from where? 
        // For now, return empty or implement reading from new orchestrator if shared state exists.
        // Or simply returning empty map which is safer than crashing.
        return {};
    }

    startRecorder(cam) {
        // NO-OP
        console.log(`[RecorderService] startRecorder called for ${cam.id} but DISABLED. Logic moved to dss-recorder.`);
    }

    stopRecorder(id) {
        // NO-OP
    }
}

module.exports = new RecorderService();
