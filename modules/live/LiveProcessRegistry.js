/**
 * LiveProcessRegistry - Enterprise Process Tracking
 * Tracks PIDs, Health, and Resource Usage for each stream
 */
const fs = require('fs');
const path = require('path');

class LiveProcessRegistry {
    constructor() {
        this.processes = new Map(); // camId -> { pid, startedAt, lastFrameAt, fps, bitrate }
        this.registryFile = "/run/dss/live_processes.json";
        this._ensureDir();
    }

    _ensureDir() {
        const dir = path.dirname(this.registryFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    register(camId, procInfo) {
        this.processes.set(camId, {
            ...procInfo,
            lastFrameAt: Date.now(),
            lastKeyframeAt: procInfo.lastKeyframeAt || null,
            fps: procInfo.fps || null,
            bitrate: procInfo.bitrate || null
        });
        this._save();
    }

    unregister(camId) {
        this.processes.delete(camId);
        this._save();
    }

    updateHealth(camId, health) {
        if (this.processes.has(camId)) {
            const current = this.processes.get(camId);
            this.processes.set(camId, {
                ...current,
                ...health,
                lastFrameAt: Date.now(),
                lastKeyframeAt: health.lastKeyframeAt !== undefined ? health.lastKeyframeAt : current.lastKeyframeAt,
                fps: health.fps !== undefined ? health.fps : current.fps,
                bitrate: health.bitrate !== undefined ? health.bitrate : current.bitrate
            });
            this._save();
        }
    }

    get(camId) {
        return this.processes.get(camId);
    }

    list() {
        return Array.from(this.processes.entries()).map(([id, info]) => ({ id, ...info }));
    }

    _save() {
        try {
            fs.writeFileSync(this.registryFile, JSON.stringify(this.list(), null, 2));
        } catch (e) {
            // ignore
        }
    }
}

module.exports = new LiveProcessRegistry();
