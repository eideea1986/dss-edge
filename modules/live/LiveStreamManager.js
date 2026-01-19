/**
 * LiveStreamManager - ENTERPRISE LIVE ENGINE
 * 
 * Rules:
 * 1. Persistent streams (started at boot)
 * 2. Unsinge RTSP In (Fan-out via go2rtc)
 * 3. WebRTC only for Live delivery
 * 4. Watchdog for every camera
 */
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const Redis = require('ioredis');
const registry = require('./LiveProcessRegistry');
const health = require('./LiveHealth');

const redis = new Redis();
const CONFIG_CAMERAS = "/opt/dss-edge/config/cameras.json";
const GO2RTC_CONFIG = "/opt/dss-edge/config/go2rtc.yaml";

class LiveStreamManager {
    constructor() {
        this.cameras = [];
        this.checkInterval = null;
    }

    async start() {
        console.log("[LIVE-MGR] Starting Enterprise Live Stream Manager...");
        this.loadConfig();
        this.syncGo2RTC();

        // Watchdog Loop (10s)
        this.checkInterval = setInterval(() => this.watchdog(), 10000);

        // Heartbeat
        setInterval(() => {
            redis.set("hb:live_manager", Date.now());
        }, 2000);

        // Watch config changes
        fs.watchFile(CONFIG_CAMERAS, () => {
            console.log("[LIVE-MGR] Config changed, resyncing...");
            this.loadConfig();
            this.syncGo2RTC();
        });
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_CAMERAS)) {
                this.cameras = JSON.parse(fs.readFileSync(CONFIG_CAMERAS, 'utf8'));
            }
        } catch (e) {
            console.error("[LIVE-MGR] Error loading cameras.json:", e.message);
        }
    }

    /**
     * UNIFIED INGEST - ANTIGRAVITY-L2
     * Ensures go2rtc is the MASTER DISTRIBUTOR
     */
    syncGo2RTC() {
        console.log("[LIVE-MGR] Syncing Go2RTC Configuration...");
        const streams = {};

        this.cameras.forEach(cam => {
            if (cam.enabled === false) return;

            const mainUrl = cam.rtspMain || (cam.streams && cam.streams.main);
            const subUrl = cam.rtspSub || (cam.streams && cam.streams.sub);

            if (mainUrl) {
                streams[`${cam.id}_hd`] = mainUrl;
                streams[cam.id] = mainUrl; // Default
            }
            if (subUrl) {
                streams[`${cam.id}_sub`] = subUrl;
                if (!mainUrl) streams[cam.id] = subUrl;
            }
        });

        // TRASSIR MODE: Build go2rtc.yaml
        let yaml = "api:\n  listen: \":1984\"\n  origin: \"*\"\n\nrtsp:\n  listen: \":8554\"\n\nwebrtc:\n  listen: \":8555\"\n  candidates:\n    - 192.168.120.208\n    - 127.0.0.1\n\nstreams:\n";

        for (const [id, url] of Object.entries(streams)) {
            yaml += `  ${id}: "${url}"\n`;
        }

        try {
            const current = fs.existsSync(GO2RTC_CONFIG) ? fs.readFileSync(GO2RTC_CONFIG, 'utf8') : "";
            if (current !== yaml) {
                fs.writeFileSync(GO2RTC_CONFIG, yaml);
                console.log("[LIVE-MGR] go2rtc.yaml updated, restarting service...");
                exec("systemctl restart dss-go2rtc");
            }
        } catch (e) {
            console.error("[LIVE-MGR] Failed to write go2rtc.yaml:", e.message);
        }
    }

    /**
     * WATCHDOG - ANTIGRAVITY-L7
     * Checks if go2rtc has active streams and if RTSP ingest is healthy
     */
    async watchdog() {
        for (const cam of this.cameras) {
            if (cam.enabled === false) continue;

            const isAlive = await health.checkGo2RTC(cam.id);
            const subAlive = await health.checkGo2RTC(`${cam.id}_sub`);

            registry.register(cam.id, {
                status: isAlive ? "ONLINE" : "ERROR",
                sub_status: subAlive ? "ONLINE" : "ERROR",
                type: "webrtc-distributor"
            });

            if (!isAlive && !subAlive) {
                // If both streams are dead, maybe camera is offline or go2rtc needs poke
                // In Trassir mode, go2rtc handles retries, but we track it.
            }
        }

        // Publish registry to Redis for UI
        redis.set("live:registry", JSON.stringify(registry.list()));
    }
}

const manager = new LiveStreamManager();
manager.start().catch(console.error);
