// src/services/PlaybackSession.js
import { v4 as uuidv4 } from 'uuid';
import PlaybackCoreV2 from './PlaybackCoreV2';
import { mediaAuthority } from './MediaAuthority';

/**
 * PlaybackSession – Enterprise abstraction over a single camera playback.
 * It owns a PlaybackCoreV2 instance (media pipeline) and exposes a clean API
 * for UI components. All resources are registered with MediaAuthority so that
 * the system can enforce global policies (max concurrent playbacks, etc.).
 */
export class PlaybackSession {
    constructor(cameraId, baseUrl = '/api') {
        this.id = uuidv4();
        this.cameraId = cameraId;
        this.baseUrl = baseUrl;
        this.state = 'STOPPED'; // PLAYING | PAUSED | SEEKING | STOPPED
        this.core = null; // PlaybackCoreV2 instance
        this.startEpoch = null;
        // Register with MediaAuthority (will enforce limits)
        mediaAuthority.registerPlayback(this);
    }

    async _ensureCore() {
        if (!this.core) {
            // Create a hidden video element for the session
            const videoEl = document.createElement('video');
            videoEl.autoplay = false;
            videoEl.playsInline = true;
            videoEl.muted = true;
            this.core = new PlaybackCoreV2(videoEl, this.cameraId, this.baseUrl);
        }
    }

    async play(startEpoch = null) {
        await this._ensureCore();
        if (startEpoch !== null) {
            await this.seek(startEpoch);
        } else {
            this.core.play();
        }
        this.state = 'PLAYING';
    }

    pause() {
        if (this.core) this.core.pause();
        this.state = 'PAUSED';
    }

    async seek(epochMs) {
        await this._ensureCore();
        // Delegate full reset logic to core (already Antigravity‑compliant)
        this.core.seek(epochMs);
        this.startEpoch = epochMs;
        this.state = 'SEEKING';
    }

    stop() {
        if (this.core) this.core.stop();
        this.state = 'STOPPED';
    }

    destroy() {
        if (this.core) {
            this.core.destroy();
            this.core = null;
        }
        // Unregister from MediaAuthority so resources are freed
        mediaAuthority.unregisterPlayback(this.id);
        this.state = 'DESTROYED';
    }
}
