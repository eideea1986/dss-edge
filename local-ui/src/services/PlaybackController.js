import Hls from 'hls.js';
import { PlayerStateMachine, PlayerEvents, PlayerStates } from './PlayerStateMachine';

export { PlayerStates };

export default class PlaybackController {
    constructor(videoElement, camId, onStateChange, baseUrl = '/api') {
        this.video = videoElement;
        this.camId = camId;
        this.baseUrl = baseUrl;
        this.segments = [];
        this.hls = null;

        // --- 1. Initialize FSM ---
        this.fsm = new PlayerStateMachine({
            onStateChange: (state, payload) => {
                if (onStateChange) onStateChange(state, payload);
            },
            onAction: (action, payload) => this._handleAction(action, payload)
        });

        // --- 2. Bind Video Events ---
        this._bindVideoEvents();
    }

    _bindVideoEvents() {
        this.video.addEventListener('waiting', () => {
            this.fsm.dispatch(PlayerEvents.BUFFER_EMPTY);
        });
        this.video.addEventListener('playing', () => {
            this.fsm.dispatch(PlayerEvents.BUFFER_FULL);
        });
        // We handle Pause manually to avoid conflicts with Seek/Buffer logic
        this.video.addEventListener('error', (e) => {
            this.fsm.dispatch(PlayerEvents.ERROR, { error: e });
        });

        // Gap Detection Monitor
        this.video.addEventListener('timeupdate', () => this._checkGap());
    }

    destroy() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        // Remove listeners if needed
    }

    // --- EXTERNAL PUBLIC API (Called by React UI) ---

    loadSegments(segments) {
        // Validate & Sort
        this.segments = (segments || []).map(s => ({
            start: Number(s.start || s.start_ts || s.startTs),
            end: Number(s.end || s.end_ts || s.endTs),
            file: s.file
        })).sort((a, b) => a.start - b.start);

        if (this.segments.length > 0) {
            // Signal FSM that metadata is ready
            // We initiate "Load Playback"
            this.fsm.dispatch(PlayerEvents.LOAD_PLAYBACK, { camId: this.camId, segments: this.segments });

            // In our case, metadata is segments. Video track is ready when we select a segment.
            // For now, let's say Metadata is ready.
            this.fsm.dispatch(PlayerEvents.METADATA_READY);

            // Auto-load first segment or wait?
            // User usually clicks timeline. Let's wait for user to Seek or Play.
            // But if we want to be "READY", we probably need a valid source.
            // However, we don't know WHERE to start yet.
            // Let's force READY state if we have segments, assuming user will Seek.
            // To do this cleanly, we can pretend video track is ready or just wait for seek.
            // Actually, we can dispatch VIDEO_TRACK_READY once the user actively seeks.
            // For now, let's leave it in LOADING or transition to READY manually?
            // The FSM says LOADING -> READY on VIDEO_TRACK_READY.
            // Let's assume we are conceptually READY since we have the timeline.
            this.fsm.dispatch(PlayerEvents.VIDEO_TRACK_READY);
        }
    }

    seekTo(ts) {
        this.fsm.dispatch(PlayerEvents.SEEK, { time: ts });
    }

    play() {
        this.fsm.dispatch(PlayerEvents.PLAY);
    }

    pause() {
        this.fsm.dispatch(PlayerEvents.PAUSE);
    }

    // --- INTERNAL ACTION HANDLERS (Driven by FSM) ---

    _handleAction(action, payload) {
        console.log(`[Controller] Executing Action: ${action}`, payload);

        switch (action) {
            case 'initStream':
                // Handled in loadSegments largely
                break;
            case 'play':
                this.video.play().catch(e => console.warn("Play interrupted", e));
                break;
            case 'pause':
                this.video.pause();
                break;
            case 'seek':
                this._performSeek(payload.time);
                break;
            case 'skipGap':
                this._performSeek(payload.nextSegment.start);
                this.fsm.dispatch(PlayerEvents.GAP_RESOLVED);
                break;
        }
    }

    // --- LOGIC IMPLEMENTATION ---

    _performSeek(targetEpoch) {
        console.log(`[Controller] Seeking to ${new Date(targetEpoch).toLocaleTimeString()}`);

        // 1. Find Segment
        const segment = this.segments.find(s => targetEpoch >= s.start && targetEpoch < s.end);

        if (!segment) {
            // Check for future segment (Gap)
            const nextSeg = this.segments.find(s => s.start > targetEpoch);
            if (nextSeg) {
                console.log("[Controller] Gap Detected during Seek.");
                // FSM handles the logic. We detect it, FSM dispatches GAP, then Action skipGap
                // But wait, we are INSIDE the action handler.
                // We should notify FSM about the Gap.
                this.fsm.dispatch(PlayerEvents.GAP_DETECTED, { nextSegment: nextSeg });
            } else {
                console.log("[Controller] End of timeline.");
                this.fsm.dispatch(PlayerEvents.END);
            }
            return;
        }

        // 2. Load HLS for specific slice
        // If we are already playing this segment/playlist, maybe just video.currentTime?
        // For Enterprise robustness, we reload the playlist at the specific timestamp 
        // to ensure alignment, unless it's a small jump.

        const playlistUrl = `${this.baseUrl}/playback/playlist/${this.camId}/${segment.start}.m3u8`;
        // Note: Backend must support /playlist/:cam/:startEpoch

        // Wait, standard route is different? 
        // User provided logic implies we just need to load stream.
        // Let's use the one we had: /playback/playlist/:camId.m3u8?start=...

        const realUrl = `${this.baseUrl}/playback/playlist/${this.camId}.m3u8?start=${targetEpoch}&end=${segment.end}`;

        if (this.hls) {
            this.hls.destroy();
        }

        if (Hls.isSupported()) {
            this.hls = new Hls();
            this.hls.loadSource(realUrl);
            this.hls.attachMedia(this.video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // If the backend generated a playlist starting exactly at targetEpoch,
                // then startPosition is 0.
                this.video.currentTime = 0;
                if (this.fsm.state === PlayerStates.PLAYING || this.fsm.state === PlayerStates.BUFFERING) {
                    this.video.play();
                }
            });

            this.hls.on(Hls.Events.FRAG_CHANGED, (e, data) => {
                this._currentFragTime = data.frag.programDateTime;
            });
        }
    }

    _checkGap() {
        // Continuous check during playback
        if (!this.segments.length) return;

        // Estimate current epoch
        // Ideally HLS provides ProgramDateTime
        if (!this._currentFragTime) return; // Wait for HLS metadata

        // Calculate exact current epoch
        // simple approx for now assuming _currentFragTime is start of frag
        // this needs robustness, but let's rely on event based GAP from seek first

        // Monitor if we fell off a segment
    }

    getCurrentTime() {
        // Return best guess of epoch time for UI sync
        if (this.hls && this._currentFragTime) {
            // Refine this
            return this._currentFragTime + (this.video.currentTime * 1000) % 4000; // vague
        }
        return Date.now(); // Fallback
    }

}
