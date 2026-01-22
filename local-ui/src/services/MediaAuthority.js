// src/services/MediaAuthority.js
import { EventEmitter } from 'events';

/**
 * MediaAuthority – central coordinator for all media pipelines (playback & live).
 * It enforces global limits, tracks active sessions and provides a simple
 * arbitration mechanism.  In a real VMS this would be a much richer service
 * (QoS, priority, billing, etc.).
 */
export class MediaAuthority extends EventEmitter {
    constructor() {
        super();
        // Configurable limits – can be tuned via env or config later
        this.maxConcurrentPlaybacks = 4; // max PlaybackSession instances
        this.activePlaybacks = new Map(); // id -> PlaybackSession
        // Live consumer limits (example values)
        this.maxLive = { GRID: 6, FULL: 2 };
        this.activeLive = new Map(); // id -> LiveConsumer
    }

    // ---------- Playback management ----------
    registerPlayback(session) {
        if (this.activePlaybacks.size >= this.maxConcurrentPlaybacks) {
            console.warn('[MediaAuthority] Playback limit reached, rejecting session', session.id);
            // In a production system we could queue or downgrade priority.
            return false;
        }
        this.activePlaybacks.set(session.id, session);
        this.emit('playbackRegistered', session.id);
        return true;
    }

    unregisterPlayback(sessionId) {
        if (this.activePlaybacks.delete(sessionId)) {
            this.emit('playbackUnregistered', sessionId);
        }
    }

    // ---------- Live consumer management ----------
    canAllocateLive(type) {
        const limit = this.maxLive[type] || 0;
        const current = Array.from(this.activeLive.values()).filter(c => c.type === type).length;
        return current < limit;
    }

    registerLive(consumer) {
        if (!this.canAllocateLive(consumer.type)) {
            console.warn('[MediaAuthority] Live limit reached for', consumer.type);
            return false;
        }
        this.activeLive.set(consumer.id, consumer);
        this.emit('liveRegistered', consumer.id);
        return true;
    }

    unregisterLive(consumerId) {
        if (this.activeLive.delete(consumerId)) {
            this.emit('liveUnregistered', consumerId);
        }
    }
}

// Export a singleton – the whole app shares the same authority
export const mediaAuthority = new MediaAuthority();
