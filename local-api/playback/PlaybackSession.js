const fs = require('fs');
const { selectSegments } = require('./SegmentSelector');
const { spawnFFmpeg } = require('./ffmpegPipeline');
const { cleanOldSessions } = require('./PlaybackManager'); // Circular dep avoided by passing manager or just logic here

class PlaybackSession {
    constructor(id, camId) {
        this.id = id;
        this.camId = camId;
        this.ffmpeg = null;
        this.concatPath = `/tmp/concat_${id}.txt`;
        this.active = false;
        this.createdAt = Date.now();
    }

    async start(options, res) {
        const { startTs, windowMs = 600000, speed = 1, format = 'mjpeg' } = options; // Default to MJPEG for direct playback

        try {
            console.log(`[PlaybackSession:${this.id}] Selecting segments...`);
            const segments = await selectSegments(this.camId, startTs, windowMs);

            if (!segments || segments.length === 0) {
                console.error(`[PlaybackSession:${this.id}] No segments found.`);
                res.status(404).send("No segments found");
                return;
            }

            let seekSeconds = 0;
            if (startTs > segments[0].start_ts) {
                seekSeconds = (startTs - segments[0].start_ts) / 1000;
            }

            console.log(`[PlaybackSession:${this.id}] Found ${segments.length} segments. Anchor start: ${segments[0].start_ts}, Seek: ${seekSeconds}s`);

            const fileContent = segments.map(s => `file '${s.file_path}'`).join('\n');
            fs.writeFileSync(this.concatPath, fileContent);

            // Spawns FFmpeg
            this.ffmpeg = spawnFFmpeg(this.concatPath, seekSeconds, speed, format);
            this.active = true;

            if (format === 'mjpeg') {
                res.writeHead(200, {
                    'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache'
                });
                this.ffmpeg.stdout.pipe(res);
            } else {
                // MPEG-TS Fallback (via LeakyBucket)
                const { LeakyBucketStream } = require('./LeakyBucketStream');
                const bucket = new LeakyBucketStream(2500000 * speed);

                res.writeHead(200, {
                    'Content-Type': 'video/mp2t',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache'
                });
                this.ffmpeg.stdout.pipe(bucket).pipe(res);

                // Ensure bucket cleanup on close
                this.ffmpeg.on('close', () => bucket.destroy());
            }

            // Handle clean termination
            this.ffmpeg.on('close', (code) => {
                console.log(`[PlaybackSession:${this.id}] FFmpeg exited with ${code}`);
                this.cleanup();
            });

            // If the CLIENT disconnects, kill ffmpeg
            res.on('close', () => {
                console.log(`[PlaybackSession:${this.id}] Client disconnected.`);
                this.stop();
            });

        } catch (e) {
            console.error(`[PlaybackSession:${this.id}] Start Error:`, e);
            if (!res.headersSent) res.status(500).send(e.message);
            this.cleanup();
        }
    }

    stop() {
        if (this.ffmpeg) {
            console.log(`[PlaybackSession:${this.id}] Killing FFmpeg...`);
            this.ffmpeg.kill('SIGKILL');
            this.ffmpeg = null;
        }
        this.cleanup();
    }

    cleanup() {
        this.active = false;
        try {
            if (fs.existsSync(this.concatPath)) {
                fs.unlinkSync(this.concatPath);
            }
        } catch (e) { }
    }
}

module.exports = { PlaybackSession };
