const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CAM_CONFIG = '/opt/dss-edge/config/cameras.json';
const REC_DIR = '/opt/dss-edge/recorder/segments';

let recorders = {};

function loadConfig() {
    try {
        if (fs.existsSync(CAM_CONFIG)) {
            const data = fs.readFileSync(CAM_CONFIG, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("[Recorder] Config Load Error:", e.message);
    }
    return [];
}

function startRecorder(cam) {
    if (recorders[cam.id]) return;

    const url = cam.rtspMain || cam.rtsp;
    if (!url) {
        console.warn(`[Recorder] No URL for ${cam.id}`);
        return;
    }

    const storeDir = path.join(REC_DIR, cam.id, 'main');
    try { fs.mkdirSync(storeDir, { recursive: true }); } catch (e) { }

    const segmentPattern = path.join(storeDir, '%Y-%m-%dT%H-%M-%S.mp4');

    console.log(`[Recorder] Starting Low-CPU Capture for ${cam.id}`);

    // OPTIMIZED FFMPEG COMMAND: COPY ONLY
    const args = [
        '-y',
        '-rtsp_transport', 'tcp',
        '-i', url,
        '-c', 'copy',      // CRITICAL: COPY STREAMS, NO TRANSCODING
        '-map', '0',       // Capture Video + Audio
        '-f', 'segment',
        '-segment_time', '300',
        '-segment_format', 'mp4',
        '-strftime', '1',
        '-reset_timestamps', '1',
        segmentPattern
    ];

    const proc = spawn('ffmpeg', args);
    recorders[cam.id] = proc;

    proc.on('close', (code) => {
        console.log(`[Recorder] ${cam.id} exited (code ${code}).`);
        delete recorders[cam.id];

        // Restart logic
        setTimeout(() => {
            const currentCams = loadConfig();
            const freshCam = currentCams.find(c => c.id === cam.id);
            if (freshCam && (freshCam.record === true || freshCam.recordingMode === 'continuous')) {
                startRecorder(freshCam);
            }
        }, 10000);
    });

    proc.on('error', (err) => {
        console.error(`[Recorder] Spawn Error ${cam.id}:`, err);
    });
}

function stopRecorder(id) {
    if (recorders[id]) {
        recorders[id].kill('SIGTERM');
    }
}

function sync() {
    const cams = loadConfig();

    // Start requested
    cams.forEach(cam => {
        if (cam.record === true || cam.recordingMode === 'continuous') {
            startRecorder(cam);
        } else {
            stopRecorder(cam.id);
        }
    });

    // Stop orphans
    Object.keys(recorders).forEach(id => {
        if (!cams.find(c => c.id === id)) {
            stopRecorder(id);
        }
    });
}

// Auto-start
sync();
// Poll for updates (safe fallback)
setInterval(sync, 15000);

module.exports = { sync };
