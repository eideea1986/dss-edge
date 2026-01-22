import { EventEmitter } from "events";
import { mediaService } from "./MediaService";

/**
 * PlaybackCoreMSE - MISSION CRITICAL PLAYER (ENTERPRISE ACCURATE)
 * 
 * Strategy: 
 * 1. Mode: 'segments' (Authoritative internal timestamps)
 * 2. timestampOffset: (seg.start_ts - sessionBaseEpoch) / 1000
 * 3. sessionBaseEpoch: start_ts of the first segment found for the seek target.
 */
export default class PlaybackCoreMSE {
    constructor(videoElement, camId, baseUrl = '/api') {
        this.video = videoElement;
        this.camId = camId;
        this.baseUrl = baseUrl;
        this.events = new EventEmitter();

        this.mediaSource = null;
        this.sourceBuffer = null;
        this.codec = 'video/mp4; codecs="avc1.64002A"'; // Antigravity strict codec
        this.queue = [];
        this.loadedSegmentFiles = new Set();
        this.abortController = null; // abort-controller for fetches

        this.sessionBaseEpoch = 0;
        this.targetEpoch = 0;
        this.isPlaying = false;
        this.isSeeking = false;
        this.isInitialized = false;
        this.sessionId = 0; // ANTIGRAVITY: Session management to prevent race conditions

        // Live‑only buffer: keep only the last 2 seconds to avoid quota errors
        this.BUFFER_WINDOW_MS = 2 * 1000; // 2 s
        this.PRUNE_THRESHOLD = 2; // aggressive prune when any back‑buffer exists
    }



    _pruneBuffer() {
        if (!this.sourceBuffer || this.sourceBuffer.updating) return;
        const now = this.video.currentTime;
        const KEEP_BEFORE = 3; // seconds to keep behind current time
        const KEEP_AFTER = 20; // seconds to keep ahead (future) if needed
        const start = Math.max(0, now - KEEP_BEFORE);
        // Remove everything older than start
        if (start > 0) {
            try {
                this.sourceBuffer.remove(0, start);
            } catch (e) { }
        }
        // Optionally prune future buffer beyond KEEP_AFTER
        if (this.sourceBuffer.buffered.length > 0) {
            const end = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
            const futureLimit = now + KEEP_AFTER;
            if (end > futureLimit) {
                try {
                    this.sourceBuffer.remove(futureLimit, end);
                } catch (e) { }
            }
        }
    }

    play(startTime = null) {
        if (startTime) {
            this.seek(startTime);
        } else {
            this.isPlaying = true;
            if (this.video.paused && this.isInitialized) {
                this.video.play().catch(() => { });
            }
        }
    }

    pause() {
        this.video.pause();
        this.isPlaying = false;
    }

    stop() {
        this.sessionId++; // Invalidate pending fetches

        // Cancel any pending network requests
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        // ENTERPRISE CLEANUP: Strict detachment
        if (this.video) {
            this.video.pause();
            if (this.video.src) {
                URL.revokeObjectURL(this.video.src);
                this.video.removeAttribute('src');
            }
            this.video.load();
        }

        this._cleanup();
        this.isPlaying = false;
        this.isInitialized = false;
        this.events.emit('stop');
    }

    // ENTERPRISE CLEANUP: Strict detachment and full reset
    destroyMedia() {
        if (this.video) {
            try {
                this.video.pause();
                if (this.video.src) {
                    URL.revokeObjectURL(this.video.src);
                    this.video.removeAttribute('src');
                }
                this.video.load();
            } catch (e) {
                console.warn("[MSE] destroyMedia video reset error:", e);
            }
        }

        // Clear logic state
        this.queue = [];
        this.loadedSegmentFiles.clear();

        if (this.mediaSource) {
            try {
                if (this.mediaSource.readyState === 'open') {
                    if (this.sourceBuffer && !this.sourceBuffer.updating) {
                        try {
                            this.mediaSource.removeSourceBuffer(this.sourceBuffer);
                        } catch (e) { }
                    }
                    try {
                        this.mediaSource.endOfStream();
                    } catch (e) { }
                }
            } catch (e) {
                console.warn("[MSE] destroyMedia MSE cleanup error:", e);
            }
            this.mediaSource = null;
            this.sourceBuffer = null;
        }
    }

    initMedia(currentSession) {
        return new Promise((resolve) => {
            this.mediaSource = new MediaSource();
            const objUrl = URL.createObjectURL(this.mediaSource);
            this.video.src = objUrl;

            const onOpen = () => {
                // Remove listener immediately
                this.mediaSource.removeEventListener('sourceopen', onOpen);

                if (this.sessionId !== currentSession) {
                    console.warn(`[MSE][S:${currentSession}] Aborting init: Session mismatch`);
                    URL.revokeObjectURL(objUrl);
                    resolve(false);
                    return;
                }

                console.log(`[MSE][S:${currentSession}] MediaSource Opened`);

                try {
                    this.sourceBuffer = this.mediaSource.addSourceBuffer(this.codec);
                    this.sourceBuffer.mode = 'segments';

                    // Critical: Listen for updateend to drive the pump loop
                    this.sourceBuffer.addEventListener('updateend', () => {
                        // Only process if session is still valid
                        if (this.sessionId === currentSession) {
                            this._processQueue(currentSession);
                            this._pruneBuffer();
                        }
                    });

                    resolve(true);
                } catch (e) {
                    console.error(`[MSE][S:${currentSession}] Codec Error:`, e);
                    resolve(false);
                }
            };

            this.mediaSource.addEventListener('sourceopen', onOpen);
            // Safety timeout
            setTimeout(() => resolve(false), 5000);
        });
    }

    seek(epochMs) {
        if (this.isSeeking) {
            // Prevent overlapping seeks
            return;
        }
        // Abort any ongoing fetches before resetting
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        // Full media destruction (Antigravity rule: Seek = New Pipeline)
        this.destroyMedia();

        this.sessionId++;
        const currentSession = this.sessionId;
        this.isSeeking = true;

        console.log(`[MSE][S:${currentSession}] Master Seek: ${new Date(epochMs).toLocaleTimeString()} (${epochMs})`);

        // Reset state for new playback
        this.targetEpoch = epochMs;
        this.sessionBaseEpoch = 0;
        this.isInitialized = false;

        // Re-initialize media stack completely
        this.initMedia(currentSession).then((success) => {
            if (!success || this.sessionId !== currentSession) return;

            this._loadRange(epochMs, currentSession).finally(() => {
                if (this.sessionId === currentSession) {
                    this.isSeeking = false;
                }
            });
        });
    }

    destroy() {
        this.stop();
        this.events.removeAllListeners();
    }

    getCurrentEpochMs() {
        if (this.isInitialized && this.sessionBaseEpoch > 0) {
            return this.sessionBaseEpoch + (this.video.currentTime * 1000);
        }
        return this.targetEpoch;
    }

    _cleanup() {
        this.queue = [];
        this.loadedSegmentFiles.clear();

        if (this.mediaSource) {
            const ms = this.mediaSource;
            if (ms.readyState === 'open') {
                try {
                    if (this.sourceBuffer) {
                        const sb = this.sourceBuffer;
                        sb.onupdateend = null;
                        if (!sb.updating) {
                            ms.removeSourceBuffer(sb);
                        }
                    }
                    ms.endOfStream();
                } catch (e) { }
            }
            this.mediaSource = null;
            this.sourceBuffer = null;
        }
    }

    async _initMSE(currentSession) {
        this.mediaSource = new MediaSource();
        const objUrl = URL.createObjectURL(this.mediaSource);
        this.video.src = objUrl;

        return new Promise((resolve) => {
            const onOpen = () => {
                this.mediaSource.removeEventListener('sourceopen', onOpen);

                if (this.sessionId !== currentSession) {
                    console.warn(`[MSE][S:${currentSession}] Aborting init: Session mismatch`);
                    URL.revokeObjectURL(objUrl);
                    resolve(false);
                    return;
                }

                console.log(`[MSE][S:${currentSession}] MediaSource Opened`);

                try {
                    this.sourceBuffer = this.mediaSource.addSourceBuffer(this.codec);
                    this.sourceBuffer.mode = 'segments';

                    this.sourceBuffer.addEventListener('updateend', () => {
                        if (this.sessionId === currentSession) {
                            this._processQueue(currentSession);
                            this._pruneBuffer();
                        }
                    });

                    resolve(true);
                } catch (e) {
                    console.error(`[MSE][S:${currentSession}] Codec Error:`, e);
                    resolve(false);
                }
            };
            this.mediaSource.addEventListener('sourceopen', onOpen);

            // Timeout safety
            setTimeout(() => resolve(false), 5000);
        });
    }

    async _loadRange(centerTs, currentSession) {
        if (this.sessionId !== currentSession) return;

        // New controller for this batch
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            const start = centerTs - 2000;
            const end = centerTs + this.BUFFER_WINDOW_MS;

            const res = await fetch(`${this.baseUrl}/playback/playlist/${this.camId}?start=${start}&end=${end}`, { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (this.sessionId !== currentSession) return;

            const newSegments = (data.segments || []).filter(s => !this.loadedSegmentFiles.has(s.url));

            if (newSegments.length > 0) {
                console.log(`[MSE][S:${currentSession}] Found ${newSegments.length} segments`);
                for (const seg of newSegments) {
                    if (this.sessionId !== currentSession) break;
                    this.loadedSegmentFiles.add(seg.url);
                    await this._fetchAndQueue(seg, currentSession, signal);
                }
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error(`[MSE][S:${currentSession}] Range Load Fail:`, e.message);
            }
        }
    }

    async _fetchAndQueue(seg, currentSession, signal) {
        if (!mediaService.canFetch()) {
            // Throttling: retry with small random delay
            await new Promise(r => setTimeout(r, 50 + Math.random() * 150));
            if (this.sessionId !== currentSession) return;
        }

        mediaService.notifyFetchStart();
        try {
            const res = await fetch(seg.url, { signal });
            if (!res.ok) return;
            const buf = await res.arrayBuffer();

            if (this.sessionId !== currentSession) return;

            this.queue.push({ buf, start_ts: seg.start_ts });
            this._processQueue(currentSession);
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.warn(`[MSE][S:${currentSession}] Segment Skip:`, seg.url);
            }
        } finally {
            mediaService.notifyFetchEnd();
        }
    }

    _processQueue(currentSession) {
        if (this.sessionId !== currentSession) return;
        if (!this.sourceBuffer || this.sourceBuffer.updating || this.queue.length === 0) {
            return;
        }

        let item; // Declare outside try to make it accessible in catch
        try {
            item = this.queue.shift();

            if (this.sessionBaseEpoch === 0) {
                this.sessionBaseEpoch = item.start_ts;
                console.log(`[MSE][S:${currentSession}] Session Base established at ${this.sessionBaseEpoch}`);
            }

            const offset = (item.start_ts - this.sessionBaseEpoch) / 1000;
            if (!isNaN(offset) && isFinite(offset)) {
                this.sourceBuffer.timestampOffset = offset;
            } else {
                return;
            }

            // CRITICAL: Double check if detached right before append
            if (this.mediaSource && this.mediaSource.readyState === 'open') {
                this.sourceBuffer.appendBuffer(item.buf);
            } else {
                return;
            }

            // Seek handling...
            if (!this.isInitialized) {
                this.isInitialized = true;
                const seekTo = (this.targetEpoch - this.sessionBaseEpoch) / 1000;
                setTimeout(() => {
                    if (this.video && this.sessionId === currentSession) {
                        try {
                            this.video.currentTime = Math.max(0, seekTo);
                            if (this.isPlaying) this.video.play().catch(() => { });
                        } catch (e) { }
                    }
                }, 100);
            }

        } catch (e) {
            console.error(`[MSE][S:${currentSession}] Append Error:`, e);

            if (e.name === 'QuotaExceededError') {
                console.warn(`[MSE][S:${currentSession}] Quota Exceeded! Engaging ULTRA STRICT Pruning.`);

                // 1. Put the item back in the queue so we don't lose it
                if (typeof item !== 'undefined') this.queue.unshift(item);

                // 2. Aggressively clear buffer behind current time
                const now = this.video.currentTime;
                try {
                    // Remove everything up to 2 seconds before now
                    if (now > 2) {
                        console.log(`[MSE][S:${currentSession}] Emergency Prune: 0 - ${now - 2}`);
                        this.sourceBuffer.remove(0, now - 2);
                    } else {
                        // If we are at the start and full, we might have garbage at the end?
                        // Remove anything beyond 30s
                        if (this.sourceBuffer.buffered.length > 0) {
                            const end = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
                            if (end > now + 30) {
                                console.log(`[MSE][S:${currentSession}] Emergency Future Prune: ${now + 30} - ${end}`);
                                this.sourceBuffer.remove(now + 30, end);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Prune failed:", err);
                }

                // 3. Pause processing briefly to let updateend fire for removal, then retry
                // Note: remove() triggers 'updateend', which calls _processQueue again.
                // We just return here.
                return;
            }
        }
    }



    _forcePrune() {
        // Deprecated by inline Quota handling, kept for interface compatibility
    }
}
