import { EventEmitter } from "events";

/**
 * PlaybackCoreMSE - Enterprise Persistent Lifecycle
 * Profile: mse-persistent-lifecycle-final
 */
export default class PlaybackCoreMSE {
    constructor(videoElement, camId, baseUrl = '/api') {
        this.video = videoElement;
        this.camId = camId;
        this.baseUrl = baseUrl;

        this.mediaSource = new MediaSource();
        this.sourceBuffer = null;
        this.queue = [];
        this.isAppending = false;
        this.isPlaying = false;
        this.isStopped = false;
        this.events = new EventEmitter();

        // Profile Flags
        this.CREATE_ONCE = true;
        this.STRICT_KEYFRAME = true;

        this._initMSE();
        this._setupEvents();
    }

    _initMSE() {
        if (!this.video) return;
        this.video.src = URL.createObjectURL(this.mediaSource);

        this.mediaSource.addEventListener('sourceopen', () => {
            console.log("[MSE] SourceOpen - Persistent Session Started");
            // Codec for fMP4
            this.sourceBuffer = this.mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
            this.sourceBuffer.mode = 'sequence';

            this.sourceBuffer.addEventListener('updateend', () => {
                this.isAppending = false;
                this._processQueue();
            });

            this.sourceBuffer.addEventListener('error', (e) => {
                console.error("[MSE] SourceBuffer Error", e);
                this.events.emit('error', e);
            });
        });
    }

    _setupEvents() {
        this.video.addEventListener('error', (e) => {
            console.error("[MSE] Video Element Error:", this.video.error);
            this.events.emit('fatal', this.video.error);
            // RESTART UI ON FATAL
            window.location.reload();
        });
    }

    async play(startTime = null) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.isStopped = false;

        const start = startTime || Date.now() - 60000;
        console.log(`[MSE] Playing ${this.camId} from ${start}`);

        try {
            await this._fetchManifest(start);
        } catch (e) {
            console.error("[MSE] Play failed:", e);
            this.isPlaying = false;
        }
    }

    async stop() {
        this.isStopped = true;
        this.isPlaying = false;
        this.queue = [];
        if (this.sourceBuffer && !this.sourceBuffer.updating) {
            try { this.sourceBuffer.abort(); } catch (e) { }
        }
        if (this.video) this.video.pause();
        this.events.emit('stop');
    }

    seek(epochMs) {
        console.log(`[MSE] Explicit Seek to ${epochMs} - Resetting Buffer`);
        this.stop();
        // Clear for sequence mode
        if (this.sourceBuffer && !this.sourceBuffer.updating) {
            try {
                const buffered = this.sourceBuffer.buffered;
                if (buffered.length > 0) {
                    this.sourceBuffer.remove(0, 1000000); // Clear large range
                }
            } catch (e) { }
        }
        this.play(epochMs);
    }

    async _fetchManifest(start) {
        const url = `${this.baseUrl}/playback/playlist/${this.camId}?start=${start}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const txt = await res.text();
        if (txt.trim().startsWith('<')) throw new Error("API HTML Fallback");

        const manifest = JSON.parse(txt);
        this._startSegmentLoop(manifest.segments);
    }

    async _startSegmentLoop(segments) {
        for (const seg of segments) {
            if (this.isStopped) break;

            // Adaptive Buffer / Pre-emptive Fetch
            if (this.queue.length > 10) {
                await new Promise(r => setTimeout(r, 1000));
            }

            try {
                const res = await fetch(seg.url);
                const data = await res.arrayBuffer();

                this.queue.push(data);
                this._processQueue();
            } catch (e) {
                console.warn("[MSE] Segment fetch failed", e);
            }
        }
    }

    _processQueue() {
        if (this.isAppending || this.queue.length === 0 || !this.sourceBuffer || this.sourceBuffer.updating) return;

        this.isAppending = true;
        const data = this.queue.shift();

        try {
            this.sourceBuffer.appendBuffer(data);
            if (this.video.paused && this.isPlaying) {
                this.video.play().catch(() => { });
            }

            // Gap skip logic
            if (this.video.buffered.length > 0) {
                const now = this.video.currentTime;
                const bufferedEnd = this.video.buffered.end(0);
                if (bufferedEnd - now > 0.8 && !this.isAppending) {
                    // check for stalls
                }
            }
        } catch (e) {
            this.isAppending = false;
            if (e.name === 'QuotaExceededError') {
                this._clearBuffer();
            }
        }
    }

    _clearBuffer() {
        if (this.sourceBuffer && !this.sourceBuffer.updating) {
            const now = this.video.currentTime;
            this.sourceBuffer.remove(0, now - 10);
        }
    }

    destroy() {
        this.stop();
        if (this.video) this.video.src = '';
    }
}
