const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cameraStore = require('../store/cameraStore');

// C++ Recorder Binary
const RECORDER_BIN = '/opt/dss-edge/recorder_cpp/build/recorder';
const STORAGE_ROOT = '/opt/dss-edge/storage';

class RecorderService {
    constructor() {
        this.processes = new Map(); // camId -> ChildProcess

        // Polling to sync state
        setInterval(() => this.sync(), 10000);

        // Initial sync delay to let stores load
        setTimeout(() => this.sync(), 5000);
    }

    sync() {
        const cameras = cameraStore.list();

        cameras.forEach(cam => {
            // Determine if recording should be active
            const shouldRecord = (cam.record === true || cam.recordingMode === 'continuous');

            if (shouldRecord) {
                this.startRecorder(cam);
            } else {
                this.stopRecorder(cam.id);
            }
        });

        // Cleanup removed cameras
        for (const [id, proc] of this.processes) {
            if (!cameras.find(c => c.id === id)) {
                this.stopRecorder(id);
            }
        }
    }

    startRecorder(cam) {
        if (this.processes.has(cam.id)) return;

        // Ensure storage directory exists
        const camDir = path.join(STORAGE_ROOT, cam.id);
        if (!fs.existsSync(camDir)) {
            try { fs.mkdirSync(camDir, { recursive: true }); } catch (e) { }
        }

        // Prefer Go2RTC loopback for stability and connection reuse, 
        // fallback to direct RTSP if needed.
        // Using 'sub' stream for recording saves disk/cpu unless 'hd' is requested explicitly.
        // But usually recording is HD.
        // Let's use direct RTSP for now as the C++ recorder is robust.
        // Actually, Go2RTC is better for connection limits.
        const rtspUrl = `rtsp://127.0.0.1:8554/${cam.id}_hd`;

        // Validating binary exists
        if (!fs.existsSync(RECORDER_BIN)) {
            console.error(`[Recorder] Binary not found at ${RECORDER_BIN}`);
            return;
        }

        console.log(`[Recorder] Starting C++ Recorder for ${cam.id} -> ${camDir}`);

        const args = [rtspUrl, camDir];
        const proc = spawn(RECORDER_BIN, args); // No special shell needed

        this.processes.set(cam.id, proc);

        proc.stdout.on('data', (d) => {
            // Optional: Forward C++ logs to Node logs?
            // console.log(`[Recorder ${cam.id}] ${d.toString().trim()}`);
        });

        proc.stderr.on('data', (d) => {
            console.error(`[Recorder ${cam.id} ERR] ${d.toString().trim()}`);
            // Detect 404/401 and maybe fallback to direct RTSP?
        });

        proc.on('close', (code) => {
            console.warn(`[Recorder] ${cam.id} exited with code ${code}`);
            this.processes.delete(cam.id);
            // Auto-restart handling is done by next sync() cycle
        });
    }

    stopRecorder(id) {
        if (this.processes.has(id)) {
            console.log(`[Recorder] Stopping ${id}`);
            const proc = this.processes.get(id);
            proc.kill('SIGTERM');
            this.processes.delete(id);
        }
    }
}

module.exports = new RecorderService();
