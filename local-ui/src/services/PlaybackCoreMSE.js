/**
 * PlaybackCoreMSE - ENTERPRISE MSE PLAYER (Trassir Style)
 * 
 * Profile Enforcement:
 * --playback-engine mse-direct
 * --playback-reset-on-seek true
 * --playback-abort-on-stop true
 */
export default class PlaybackCoreMSE {
    constructor(videoElement, camId, baseUrl = '/api') {
        this.video = videoElement;
        this.camId = camId;
        this.baseUrl = baseUrl;

        this.mediaSource = null;
        this.sourceBuffer = null;
        this.queue = [];
        this.isAppending = false;
        this.isPlaying = false;

        this.manifest = null;
        this.currentIndex = -1;
        this.currentEpochMs = 0;

        this.abortController = null;
    }

    async play(startTime = null) {
        if (this.isPlaying) return;
        this.isPlaying = true;

        console.log(`[MSE] Starting play for ${this.camId} at ${startTime}`);

        try {
            // 1. Fetch Manifest (JSON)
            const start = startTime || Date.now() - 60000;
            const url = `${this.baseUrl}/playback/playlist/${this.camId}?start=${start}`;

            this.abortController = new AbortController();
            const res = await fetch(url, { signal: this.abortController.signal });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const txt = await res.text();
            // ANTIGRAVITY-3: HTML GUARD
            if (txt.trim().startsWith('<')) {
                console.error("[MSE] Received HTML instead of JSON manifest. Routing error?");
                throw new Error('API returned HTML (fallback)');
            }

            this.manifest = JSON.parse(txt);

            if (!this.manifest.segments || !this.manifest.segments.length) {
                console.warn("[MSE] No segments found");
                this.isPlaying = false;
                return;
            }

            this.currentIndex = 0;
            this._initMSE();
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.error("[MSE] Play failed:", e);
            this.isPlaying = false;
        }
    }

    _initMSE() {
        // Cleanup previous if any (though stop() should have handled it)
        if (this.mediaSource) {
            this.video.src = '';
            this.mediaSource = null;
        }

        this.mediaSource = new MediaSource();
        this.video.src = URL.createObjectURL(this.mediaSource);

        this.mediaSource.addEventListener('sourceopen', () => {
            console.log("[MSE] SourceOpen");
            // AVC1.42E01E = H.264 Baseline L3.0
            this.sourceBuffer = this.mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
            this.sourceBuffer.mode = 'sequence';

            this.sourceBuffer.addEventListener('updateend', () => {
                this.isAppending = false;
                this._processQueue();
            });

            this.sourceBuffer.addEventListener('error', (e) => {
                console.error("[MSE] SourceBuffer Error", e);
            });

            this._loadNext();
        });
    }

    async _loadNext() {
        if (!this.isPlaying || !this.manifest || this.currentIndex >= this.manifest.segments.length) {
            if (this.currentIndex >= this.manifest.segments.length && this.mediaSource?.readyState === 'open') {
                console.log("[MSE] No more segments, closing stream");
                // Don't call endOfStream immediately, wait for buffer to drain if needed
            }
            return;
        }

        const segment = this.manifest.segments[this.currentIndex];
        this.currentIndex++;

        try {
            const response = await fetch(segment.url, { signal: this.abortController?.signal });
            if (!response.ok) throw new Error(`Segment fetch failed: ${response.status}`);

            const data = await response.arrayBuffer();

            // Validate data is not HTML
            const view = new Uint8Array(data.slice(0, 10));
            const firstChars = String.fromCharCode(...view);
            if (firstChars.includes('<html') || firstChars.includes('<!DOC')) {
                throw new Error('Segment data is HTML (routing error)');
            }

            this.queue.push({
                data,
                start_ts: segment.start_ts
            });
            this._processQueue();

            // Buffer management: fetch ahead but don't flood
            if (this.queue.length < 5) {
                this._loadNext();
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error("[MSE] Segment load error:", e);
                // Try next segment after a small delay
                setTimeout(() => this._loadNext(), 1000);
            }
        }
    }

    _processQueue() {
        if (this.isAppending || this.queue.length === 0 || !this.sourceBuffer || this.sourceBuffer.updating) return;

        this.isAppending = true;
        const item = this.queue.shift();

        try {
            this.sourceBuffer.appendBuffer(item.data);
            this.currentEpochMs = item.start_ts;

            if (this.video.paused && this.isPlaying) {
                this.video.play().catch(err => {
                    if (err.name !== 'NotAllowedError') console.warn("[MSE] Auto-play blocked", err);
                });
            }
        } catch (e) {
            console.error("[MSE] AppendBuffer failed:", e);
            this.isAppending = false;
            // If buffer is full, we might need to remove some old data
            if (e.name === 'QuotaExceededError') {
                console.warn("[MSE] Buffer Full, clearing...");
                const removeStart = 0;
                const removeEnd = this.video.currentTime - 10;
                if (removeEnd > removeStart) {
                    this.sourceBuffer.remove(removeStart, removeEnd);
                }
            }
        }
    }

    // ANTIGRAVITY-4: SEEK = HARD RESET
    seek(epochMs) {
        console.log(`[MSE] Seek to ${epochMs}`);
        this.stop();
        this.play(epochMs);
    }

    pause() {
        console.log("[MSE] Pause");
        this.video.pause();
    }

    stop() {
        console.log("[MSE] Stop/Reset");
        this.isPlaying = false;

        // 1. Abort any pending fetches
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        // 2. Clear state
        this.queue = [];
        this.currentIndex = -1;
        this.manifest = null;
        this.isAppending = false;

        // 3. Reset MediaSource/SourceBuffer
        if (this.sourceBuffer) {
            try {
                if (!this.sourceBuffer.updating) {
                    this.sourceBuffer.abort();
                }
            } catch (e) { }
            this.sourceBuffer = null;
        }

        if (this.mediaSource) {
            try {
                if (this.mediaSource.readyState === 'open') {
                    this.mediaSource.endOfStream();
                }
            } catch (e) { }
            this.mediaSource = null;
        }

        // 4. Reset Video Element
        if (this.video) {
            this.video.pause();
            this.video.src = '';
            this.video.load();
        }
    }

    getCurrentEpochMs() {
        if (!this.currentEpochMs) return 0;
        // In sequence mode, currentTime starts from 0 for the whole sequence
        return this.currentEpochMs + (this.video.currentTime * 1000);
    }

    destroy() {
        this.stop();
    }
}
