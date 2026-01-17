export const PlayerStates = Object.freeze({
    IDLE: "IDLE",
    LOADING: "LOADING",
    READY: "READY",
    PLAYING: "PLAYING",
    PAUSED: "PAUSED",
    BUFFERING: "BUFFERING",
    GAP: "GAP",
    ERROR: "ERROR"
});

export const PlayerEvents = Object.freeze({
    LOAD_LIVE: "LOAD_LIVE",
    LOAD_PLAYBACK: "LOAD_PLAYBACK",
    METADATA_READY: "METADATA_READY",
    VIDEO_TRACK_READY: "VIDEO_TRACK_READY",
    PLAY: "PLAY",
    PAUSE: "PAUSE",
    SEEK: "SEEK",
    BUFFER_EMPTY: "BUFFER_EMPTY",
    BUFFER_FULL: "BUFFER_FULL",
    GAP_DETECTED: "GAP_DETECTED",
    GAP_RESOLVED: "GAP_RESOLVED",
    END: "END",
    ERROR: "ERROR",
    RESET: "RESET"
});

export class PlayerStateMachine {
    constructor({ onStateChange, onAction, logger = console }) {
        this.state = PlayerStates.IDLE;
        this.onStateChange = onStateChange;
        this.onAction = onAction;
        this.log = logger;
    }

    transition(next, payload) {
        if (this.log && this.log.debug) {
            this.log.debug(`[PLAYER FSM] ${this.state} -> ${next}`, payload || "");
        } else {
            // Fallback if logger doesn't have debug
            console.log(`[PLAYER FSM] ${this.state} -> ${next}`, payload || "");
        }
        this.state = next;
        if (this.onStateChange) this.onStateChange(next, payload);
    }

    dispatch(event, payload = {}) {
        if (this.log && this.log.debug) {
            this.log.debug(`[PLAYER FSM EVENT] ${event}`, payload);
        }

        switch (this.state) {
            case PlayerStates.IDLE:
                if (event === PlayerEvents.LOAD_LIVE || event === PlayerEvents.LOAD_PLAYBACK) {
                    this.transition(PlayerStates.LOADING, payload);
                    if (this.onAction) this.onAction("initStream", payload);
                }
                break;

            case PlayerStates.LOADING:
                if (event === PlayerEvents.METADATA_READY) {
                    // metadata ok, but video not yet
                    return;
                }
                if (event === PlayerEvents.VIDEO_TRACK_READY) {
                    this.transition(PlayerStates.READY);
                }
                if (event === PlayerEvents.ERROR) {
                    this.transition(PlayerStates.ERROR, payload);
                }
                break;

            case PlayerStates.READY:
                if (event === PlayerEvents.PLAY) {
                    this.transition(PlayerStates.PLAYING);
                    if (this.onAction) this.onAction("play");
                }
                if (event === PlayerEvents.SEEK) {
                    if (this.onAction) this.onAction("seek", payload);
                }
                if (event === PlayerEvents.ERROR) {
                    this.transition(PlayerStates.ERROR, payload);
                }
                break;

            case PlayerStates.PLAYING:
                if (event === PlayerEvents.PAUSE) {
                    this.transition(PlayerStates.PAUSED);
                    if (this.onAction) this.onAction("pause");
                }
                if (event === PlayerEvents.BUFFER_EMPTY) {
                    this.transition(PlayerStates.BUFFERING);
                }
                if (event === PlayerEvents.GAP_DETECTED) {
                    this.transition(PlayerStates.GAP, payload);
                    if (this.onAction) this.onAction("skipGap", payload);
                }
                if (event === PlayerEvents.END) {
                    this.transition(PlayerStates.IDLE);
                }
                if (event === PlayerEvents.ERROR) {
                    this.transition(PlayerStates.ERROR, payload);
                }
                break;

            case PlayerStates.BUFFERING:
                if (event === PlayerEvents.BUFFER_FULL) {
                    this.transition(PlayerStates.PLAYING);
                }
                if (event === PlayerEvents.GAP_DETECTED) {
                    this.transition(PlayerStates.GAP, payload);
                }
                if (event === PlayerEvents.ERROR) {
                    this.transition(PlayerStates.ERROR, payload);
                }
                break;

            case PlayerStates.GAP:
                if (event === PlayerEvents.GAP_RESOLVED) {
                    this.transition(PlayerStates.BUFFERING);
                }
                if (event === PlayerEvents.END) {
                    this.transition(PlayerStates.IDLE);
                }
                break;

            case PlayerStates.PAUSED:
                if (event === PlayerEvents.PLAY) {
                    this.transition(PlayerStates.PLAYING);
                    if (this.onAction) this.onAction("play");
                }
                if (event === PlayerEvents.SEEK) {
                    if (this.onAction) this.onAction("seek", payload);
                }
                break;

            case PlayerStates.ERROR:
                if (event === PlayerEvents.RESET) {
                    this.transition(PlayerStates.IDLE);
                }
                break;

            default:
                console.error("Unknown state", this.state);
        }
    }
}
