import { EventEmitter } from "events";

/**
 * PlaybackCoreHLS - HLS based playback implementation
 * Replaces MSE implementation for better compatibility and stability
 */
export default class PlaybackCoreHLS {
    constructor(videoElement, camId, baseUrl = '/api') {
        this.video = videoElement;
        this.camId = camId;
        this.baseUrl = baseUrl;
        this.hls = null;
        this.events = new EventEmitter();
        this.currentStartEpoch = 0;
        this.isPlaying = false;
    }

    /**
     * Resume playback or start from default
     */
    play(startTime = null) {
        if (startTime) {
            this.seek(startTime);
        } else if (this.video.paused && this.video.src) {
            this.video.play().catch(e => console.warn("[HLS] Play failed:", e));
        } else if (!this.video.src) {
            // Default start: now - 1 min? Or just don't start.
            // Playback.js usually calls seek() or play() with no args to resume.
            // If no src, we do nothing until seek is called?
            // Or we can try to play live/recent history.
        }
        this.isPlaying = true;
    }

    pause() {
        this.video.pause();
        this.isPlaying = false;
    }

    stop() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.video.removeAttribute('src');
        this.video.load();
        this.isPlaying = false;
        this.events.emit('stop');
    }

    seek(epochMs) {
        console.log(`[HLS] Seek to ${epochMs}`);
        this._load(epochMs);
        this.isPlaying = true;
    }

    destroy() {
        this.stop();
        this.events.removeAllListeners();
    }

    getCurrentEpochMs() {
        // Simple estimation: Start Time + Video Current Time
        if (this.video && !this.video.paused && this.currentStartEpoch) {
            return this.currentStartEpoch + (this.video.currentTime * 1000);
        }
        return this.currentStartEpoch;
    }

    _load(startTs) {
        this.currentStartEpoch = startTs;
        // Load a 4-hour window to allow some seeking ahead
        const endTs = startTs + (4 * 60 * 60 * 1000);

        const playlistUrl = `${this.baseUrl}/playback/playlist/${this.camId}.m3u8?start=${startTs}&end=${endTs}`;

        // Cleanup existing HLS instance
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        // Native HLS (Safari)
        if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            this.video.src = playlistUrl;
            this.video.onloadedmetadata = () => {
                this.video.play().catch(e => console.error("[HLS] Native play failed:", e));
            };
        }
        // HLS.js
        else if (window.Hls && window.Hls.isSupported()) {
            this.hls = new window.Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });

            this.hls.loadSource(playlistUrl);
            this.hls.attachMedia(this.video);

            this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                console.log(`[HLS] Manifest parsed for ${this.camId}`);
                this.video.play().catch(e => console.error("[HLS] Play failed:", e));
            });

            this.hls.on(window.Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error(`[HLS] Fatal error: ${data.type}`, data);
                    switch (data.type) {
                        case window.Hls.ErrorTypes.NETWORK_ERROR:
                            console.log("[HLS] Trying to recover network error...");
                            this.hls.startLoad();
                            break;
                        case window.Hls.ErrorTypes.MEDIA_ERROR:
                            console.log("[HLS] Trying to recover media error...");
                            this.hls.recoverMediaError();
                            break;
                        default:
                            console.log("[HLS] Unrecoverable error, destroying.");
                            this.hls.destroy();
                            break;
                    }
                }
            });
        } else {
            console.error("[HLS] No HLS support found (neither native nor hls.js)");
        }
    }
}
