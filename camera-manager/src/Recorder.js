const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./Database');

class Recorder {
    constructor() {
        this.processes = {};
        this.timers = {};
        this.storageRoot = '/opt/dss-edge/recorder/segments';
        this.mapPath = '/opt/dss-edge/recorder/storage_map.json';
        if (!fs.existsSync(this.storageRoot)) fs.mkdirSync(this.storageRoot, { recursive: true });
    }

    getUuid(camId) {
        try {
            if (fs.existsSync(this.mapPath)) {
                const map = JSON.parse(fs.readFileSync(this.mapPath, 'utf8'));
                return map[camId] || camId;
            }
        } catch (e) { }
        return camId;
    }

    startRecording(camera) {
        if (this.processes[camera.id]) return;

        const uuid = this.getUuid(camera.id);
        const today = new Date().toISOString().split('T')[0];
        const camDir = path.join(this.storageRoot, uuid, 'main', today);

        try {
            if (!fs.existsSync(camDir)) fs.mkdirSync(camDir, { recursive: true });
        } catch (e) {
            console.error(`[Recorder] Failed to create folder ${camDir}:`, e.message);
            return;
        }

        // Use Go2RTC for Recording (Unified Connection Management)
        // If the 'hd' stream is available in Go2RTC, use it. Otherwise use direct.
        const rtspUrl = `rtsp://127.0.0.1:8554/${camera.id}_hd`;

        console.log(`[Recorder] Record Request for ${camera.id} (${uuid})`);
        console.log(`[Recorder] Source: Go2RTC Local Loopback -> ${camera.id}_hd`);

        // Output Pattern matching Frontend Expectation: HH-MM-SS.mp4
        const outputPattern = path.join(camDir, '%H-%M-%S.mp4');

        // Schedule periodic sync to ensure DB index is up to date
        if (this.timers[camera.id]) clearInterval(this.timers[camera.id]);
        this.timers[camera.id] = setInterval(() => this.syncSegments(camera.id, camDir), 30000);
        // Initial sync
        this.syncSegments(camera.id, camDir);

        const args = [
            '-rtsp_transport', 'tcp',
            '-loglevel', 'info',
            '-nostats',
            '-i', rtspUrl,
            '-c', 'copy',
            '-map', '0',
            '-f', 'segment',
            '-segment_time', '10', // 10s segments
            '-segment_format', 'mp4',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
            '-reset_timestamps', '1',
            '-strftime', '1',
            outputPattern
        ];

        console.log(`[Recorder] Spawning: ffmpeg ${args.join(' ')}`);

        try {
            const proc = spawn('ffmpeg', args);
            this.processes[camera.id] = proc;

            proc.stderr.on('data', (data) => {
                const line = data.toString();
                // We rely on file system sync for indexing now, logging strictly for debug if needed
                if (line.includes('Error') || line.includes('error')) {
                    // console.warn(`[Recorder:${camera.id}] ${line.trim()}`);
                }
            });

            proc.on('error', (err) => {
                console.error(`[Recorder:${camera.id}] Spawn Error:`, err.message);
            });

            proc.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`[Recorder:${camera.id}] FFmpeg exited with code ${code}. RTSP: ${rtspUrl.split('@')[1] || rtspUrl}`);
                }
                delete this.processes[camera.id];
                setTimeout(() => this.startRecording(camera), 15000);
            });
        } catch (err) {
            console.error(`[Recorder:${camera.id}] Critical Exception:`, err.message);
        }
    }

    stopRecording(camId) {
        if (this.processes[camId]) {
            this.processes[camId].kill('SIGTERM');
            delete this.processes[camId];
        }
        if (this.timers[camId]) {
            clearInterval(this.timers[camId]);
            delete this.timers[camId];
        }
    }

    // Robust Sync Mechanism: Polls directory to ensure no segments are missed
    async syncSegments(camId, camDir) {
        try {
            if (!fs.existsSync(camDir)) return;
            // Scan for MP4 files as expected by Frontend
            const files = fs.readdirSync(camDir).filter(f => f.endsWith('.mp4'));

            for (const file of files) {
                // Parse timestamp from filename: HH-MM-SS.mp4 (Front-end format)
                const match = file.match(/(\d{2})-(\d{2})-(\d{2})\.mp4/);
                if (match) {
                    const [_, h, min, s] = match;
                    const now = new Date();
                    // Construct date from today's components + filename time
                    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(min), parseInt(s));

                    const startTs = Math.floor(date.getTime() / 1000);
                    const duration = 10;
                    const endTs = startTs + duration;
                    const filePath = path.join(camDir, file);

                    try {
                        await db.addSegment(camId, startTs, endTs, duration, filePath, 'continuous');
                    } catch (e) { }
                }
            }
        } catch (e) {
            console.error(`[Recorder:${camId}] Sync Error:`, e.message);
        }
    }
}

module.exports = new Recorder();
