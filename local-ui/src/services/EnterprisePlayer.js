import Hls from 'hls.js';

/**
 * Enterprise Player State Machine
 * 
 * IDLE: Player initialized, waiting for data.
 * READY: Data loaded, timeline built, ready to play.
 * BUFFERING: Loading video segments (HLS/MSE).
 * PLAYING: Video is actively playing.
 * PAUSED: Video is paused by user.
 * SEEKING: User or logic requested a time jump.
 * WAITING_FOR_SEGMENT: Playhead is in a gap, waiting or skipping.
 * ERROR: Critical failure.
 */
export const PlayerState = {
    IDLE: 'IDLE',
    READY: 'READY',
    BUFFERING: 'BUFFERING',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    SEEKING: 'SEEKING',
    WAITING_FOR_SEGMENT: 'WAITING_FOR_SEGMENT',
    ERROR: 'ERROR'
};

export default class EnterprisePlayer {
    constructor(videoElement, camId, onStateChange, baseUrl = '/api') {
        this.video = videoElement;
        this.camId = camId;
        this.baseUrl = baseUrl;
        this.onStateChange = onStateChange || (() => { });

        this.state = PlayerState.IDLE;
        this.segments = [];
        this.hls = null;
        this.virtualTimeline = []; // { start, end, file }

        this._updateState(PlayerState.IDLE);

        // Bind video events
        this.video.addEventListener('waiting', () => this._updateState(PlayerState.BUFFERING));
        this.video.addEventListener('playing', () => this._updateState(PlayerState.PLAYING));
        this.video.addEventListener('pause', () => this._updateState(PlayerState.PAUSED));
        this.video.addEventListener('error', (e) => this._handleError(e));
        this.video.addEventListener('timeupdate', () => this._onTimeUpdate());
    }

    _updateState(newState) {
        if (this.state === newState) return;
        console.log(`[Player] State: ${this.state} -> ${newState}`);
        this.state = newState;
        this.onStateChange(this.state);
    }

    /**
     * 1. Load Data & Validate
     */
    loadSegments(segments) {
        if (!Array.isArray(segments) || segments.length === 0) {
            console.warn("[Player] No segments provided.");
            this._updateState(PlayerState.IDLE);
            return;
        }

        // Validate & Sort
        this.segments = segments
            .map(s => ({
                start: Number(s.start || s.start_ts || s.startTs),
                end: Number(s.end || s.end_ts || s.endTs),
                file: s.file
            }))
            .sort((a, b) => a.start - b.start)
            .filter(s => s.end > s.start); // Remove invalid

        if (this.segments.length === 0) {
            console.warn("[Player] All segments were invalid.");
            return;
        }

        console.log(`[Player] Loaded ${this.segments.length} valid segments.`);
        this._updateState(PlayerState.READY);
    }

    /**
     * 2. Intelligent Play/Seek
     */
    async seekTo(targetEpochMs, autoPlay = true) {
        if (this.state === PlayerState.IDLE) {
            console.warn("[Player] Cannot seek in IDLE state. Load segments first.");
            return;
        }

        this._updateState(PlayerState.SEEKING);

        // A. SNAP TO SEGMENT (Keyframe Awareness Strategy)
        // Check if target is inside a segment
        let activeSegment = this.segments.find(s => targetEpochMs >= s.start && targetEpochMs <= s.end);
        let actualStart = targetEpochMs;

        // B. GAP HANDLING (Jump to next)
        if (!activeSegment) {
            console.log(`[Player] Target ${new Date(targetEpochMs).toLocaleTimeString()} is in a GAP.`);
            const nextSegment = this.segments.find(s => s.start > targetEpochMs);
            if (nextSegment) {
                console.log(`[Player] Jumping to next segment: ${new Date(nextSegment.start).toLocaleTimeString()}`);
                activeSegment = nextSegment;
                actualStart = nextSegment.start;
            } else {
                console.log("[Player] No future segments found. End of timeline.");
                this._updateState(PlayerState.PAUSED); // Or finished
                return;
            }
        }

        // C. LOAD SOURCE (HLS Manifest Generation)
        // We request a playlist starting from this specific timestamp
        // The backend should return an m3u8 starting at the nearest keyframe for this 'start' param
        const playlistUrl = `${this.baseUrl}/playback/playlist/${this.camId}.m3u8?start=${actualStart}&end=${actualStart + 3600000}`; // Load 1 hr ahead

        this._loadHlsSource(playlistUrl, actualStart);

        if (autoPlay) {
            try {
                await this.video.play();
            } catch (e) {
                console.warn("[Player] Autoplay prevented:", e);
                this._updateState(PlayerState.PAUSED);
            }
        }
    }

    _loadHlsSource(url, startEpoch) {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        if (Hls.isSupported()) {
            this.hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false, // For playback we want stability, not low latency
                maxBufferLength: 30,
            });

            this.hls.loadSource(url);
            this.hls.attachMedia(this.video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                console.log("[Player] Manifest Loaded.");
                // HLS.js usually handles the start offset if the manifest is correct
                // But we can double check
                this._updateState(PlayerState.BUFFERING);
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error("[Player] Fatal HLS Error:", data);
                    this._updateState(PlayerState.ERROR);
                    this.hls.destroy();
                }
            });

            // Sync current HLS time mapping
            this.hls.on(Hls.Events.FRAG_CHANGED, (e, data) => {
                if (data.frag) {
                    this.currentFragProgramDateTime = data.frag.programDateTime;
                    this.currentFragStartPTS = data.frag.start;
                }
            });

        } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari / Native HLS
            this.video.src = url;
        }
    }

    _onTimeUpdate() {
        // Calculate current "Real World" time
        // This is tricky with HLS. We need Program Date Time from fragments if possible
        // Or we can rely on the backend manifest being 1-to-1 with requested time if it's VOD

        // Simple Gap Check for now (if playing linearly)
        // If we fall off the edge of a segment, this logic should fire
    }

    /**
     * Get Current Epoch Time
     * Uses HLS Program Date Time if available, otherwise estimates.
     */
    getCurrentTime() {
        if (this.hls && this.currentFragProgramDateTime) {
            const offset = this.video.currentTime - this.currentFragStartPTS;
            return this.currentFragProgramDateTime + (offset * 1000);
        }
        // Fallback or Native HLS might need different handling
        return Date.now();
    }

    pause() {
        this.video.pause();
    }

    play() {
        this.video.play();
    }

    destroy() {
        if (this.hls) this.hls.destroy();
        // Remove listeners (optional if element is destroyed)
    }
}
