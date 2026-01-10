const ffmpeg = require('fluent-ffmpeg');
const EventEmitter = require('events');

class MotionDetector extends EventEmitter {
    constructor(rtspUrl, sensitivity = 50) {
        super();
        this.rtspUrl = rtspUrl;
        // Map 1-100 sensitivity to 0.1 - 0.001 scene change threshold
        // 100 sens = 0.001 (very sensitive)
        // 1 sens = 0.1 (major changes only)
        const inverse = 101 - sensitivity;
        this.threshold = inverse / 1000.0;

        this.command = null;
        this.isMotion = false;
        this.motionTimeout = null;
        this.postMotionDuration = 10000; // 10s keep-alive
        this.isActive = false;
        this.lastDetectionTime = 0;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;

        console.log(`[Motion] Starting detector on ${this.rtspUrl} (Thresh: ${this.threshold})`);

        this.command = ffmpeg(this.rtspUrl)
            .inputOptions([
                '-rtsp_transport tcp',
                '-flags low_delay'
            ])
            .noAudio()
            .fps(1) // 1 FPS is plenty for basic motion detection
            // Extreme Optimization: 160px width is plenty for motion logic.
            .videoFilters(`scale=160:-1,select='gt(scene,${this.threshold})',showinfo`)
            .format('null')
            .output('-')
            .on('start', (cmd) => {
                console.log('[Motion] FFmpeg started:', cmd);
            })
            .on('stderr', (line) => {
                // Throttling to prevent event loop choking if stderr is flooded
                const now = Date.now();
                if (now - this.lastDetectionTime < 500) return;

                if (line.includes('Parsed_showinfo') && line.includes('pts:')) {
                    this.lastDetectionTime = now;
                    this.handleMotionWait();
                }
            })
            .on('error', (err) => {
                console.error('[Motion] Error:', err.message);
                this.restart();
            })
            .on('end', () => {
                console.log('[Motion] Stream ended.');
                this.restart();
            });

        this.command.run();
    }

    stop() {
        this.isActive = false;
        if (this.command) {
            this.command.kill('SIGKILL');
            this.command = null;
        }
    }

    restart() {
        if (!this.isActive) return;
        setTimeout(() => {
            this.stop();
            this.start();
        }, 5000);
    }

    handleMotionWait() {
        const now = Date.now();
        // Debounce slightly (e.g. 500ms limit between triggers technically not needed if we just extend timer)

        if (!this.isMotion) {
            this.isMotion = true;
            this.emit('motion_start', now);
            console.log('[Motion] EVENT START');
        }

        // Reset/Extend timeout
        if (this.motionTimeout) clearTimeout(this.motionTimeout);
        this.motionTimeout = setTimeout(() => {
            this.isMotion = false;
            this.emit('motion_end', Date.now());
            console.log('[Motion] EVENT END');
        }, this.postMotionDuration);
    }
}

module.exports = MotionDetector;
