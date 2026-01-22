
/**
 * MediaService - Central Resource Management for Antigravity Playback
 *
 * Responsibilities:
 * 1. Policy Enforcement: Limit concurrent heavy operations (e.g. fetches, decodes)
 * 2. Session Tracking: Registry of active playback sessions
 * 3. Connection Pooling: Manage browser connection limits (HTTP/1.1 vs HTTP/2)
 */
class MediaService {
    constructor() {
        this.activeSessions = new Set();
        this.pendingFetches = 0;
        this.MAX_CONCURRENT_FETCHES = 4; // Browser limit safe-guard
    }

    registerSession(sessionId) {
        this.activeSessions.add(sessionId);
        // console.log(`[MediaService] Registered session ${sessionId}. Total: ${this.activeSessions.size}`);
    }

    unregisterSession(sessionId) {
        this.activeSessions.delete(sessionId);
        // console.log(`[MediaService] Unregistered session ${sessionId}. Total: ${this.activeSessions.size}`);
    }

    /**
     * Request permission to perform a heavy network operation (fetch segment)
     * Returns true if allowed, false if should retry later
     */
    canFetch() {
        return this.pendingFetches < this.MAX_CONCURRENT_FETCHES;
    }

    notifyFetchStart() {
        this.pendingFetches++;
    }

    notifyFetchEnd() {
        this.pendingFetches = Math.max(0, this.pendingFetches - 1);
    }
}

// Singleton instance
export const mediaService = new MediaService();
