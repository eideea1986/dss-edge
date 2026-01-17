/**
 * DSS Enterprise Recorder V2 (Strict Mode)
 * - Hierarchical Storage: camId/YYYY/MM/DD/HH/MM-SS.mp4
 * - Strict GOP Alignment
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const Redis = require("ioredis");

// --- CONFIGURATION ---
const CONFIG = {
    SEGMENT_DURATION: 5,
    FPS: 25,
    STORAGE_ROOT: "/opt/dss-edge/storage",
    INDEX_ROOT: "/opt/dss-edge/index",
    CONFIG_FILE: "/opt/dss-edge/config/cameras.json",
    REDIS_STREAM_KEY: "storage:segments",
    HEARTBEAT_KEY: "hb:recorder",
    SYNC_INTERVAL_MS: 30000,
    POLL_INTERVAL_MS: 1000
};

const redis = new Redis();
const activeRecorders = new Map();

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG.CONFIG_FILE, "utf8"));
    } catch (e) { return []; }
}

class RecorderV2 {
    start() {
        console.log("[RECORDER-V2] Engine Starting...");
        this.sync();
        setInterval(() => this.sync(), CONFIG.SYNC_INTERVAL_MS);
        setInterval(() => this.heartbeat(), 2000);
        setInterval(() => this.poll(), CONFIG.POLL_INTERVAL_MS);
    }

    heartbeat() { redis.set(CONFIG.HEARTBEAT_KEY, Date.now()); }

    sync() {
        const cameras = loadConfig();
        const activeIds = new Set(cameras.map(c => c.id));

        cameras.forEach(cam => {
            if (cam.status === 'ONLINE' || cam.enabled !== false) this.spawn(cam);
        });

        for (const [id, state] of activeRecorders) {
            if (!activeIds.has(id)) {
                state.proc.kill();
                activeRecorders.delete(id);
            }
        }
    }

    spawn(cam) {
        if (activeRecorders.has(cam.id)) return;

        const camStorage = path.join(CONFIG.STORAGE_ROOT, cam.id);
        const camIndex = path.join(CONFIG.INDEX_ROOT, cam.id);
        ensureDir(camStorage);
        ensureDir(camIndex);

        const indexFile = path.join(camIndex, "segments.csv");

        // Pattern hierarchical
        // path.join with % handles escaping poorly in some shells, we use string literal
        const segmentPattern = `${camStorage}/%Y/%m/%d/%H/%M-%S.mp4`;

        const user = cam.credentials?.user || cam.user || "admin";
        const pass = cam.credentials?.pass || cam.pass || "admin";
        const url = cam.streams?.main || cam.rtsp_main || `rtsp://${user}:${pass}@${cam.ip}:554/cam/realmonitor?channel=1&subtype=0`;

        // Pre-create some subfolders for the current hour to help ffmpeg
        const now = new Date();
        const hourPath = path.join(camStorage,
            String(now.getFullYear()),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0')
        );
        ensureDir(hourPath);

        const args = [
            "-hide_banner", "-loglevel", "error",
            "-rtsp_transport", "tcp",
            "-i", url,
            "-an",
            "-c:v", "copy", // 🔥 EMERGENCY: Switch to stream copy to save CPU
            "-map", "0:v:0",

            "-f", "segment",
            "-segment_time", CONFIG.SEGMENT_DURATION.toString(),
            "-segment_atclocktime", "1",
            "-reset_timestamps", "1",
            "-strftime", "1",

            "-segment_list", indexFile,
            "-segment_list_type", "csv",
            "-segment_list_size", "20",
            "-segment_list_flags", "+live",
            "-segment_format", "mp4",
            "-movflags", "+faststart+frag_keyframe+empty_moov",
            segmentPattern
        ];

        const proc = spawn("ffmpeg", args, { stdio: "inherit" });
        proc.on("exit", () => {
            activeRecorders.delete(cam.id);
            console.warn(`[RECORDER] ${cam.id} died.`);
        });

        activeRecorders.set(cam.id, { proc, indexFile, processed: new Set() });
    }

    poll() {
        for (const [id, state] of activeRecorders) {
            if (!fs.existsSync(state.indexFile)) continue;
            try {
                const lines = fs.readFileSync(state.indexFile, "utf8").trim().split("\n");
                lines.forEach(line => {
                    const [file] = line.split(",");
                    if (!file || state.processed.has(file)) return;

                    state.processed.add(file);
                    if (state.processed.size > 100) state.processed.delete(state.processed.values().next().value);

                    const now = new Date();
                    const hierarchicalPath = path.join(
                        String(now.getFullYear()),
                        String(now.getMonth() + 1).padStart(2, '0'),
                        String(now.getDate()).padStart(2, '0'),
                        String(now.getHours()).padStart(2, '0'),
                        file
                    );

                    const fullPath = path.join(CONFIG.STORAGE_ROOT, id, hierarchicalPath);

                    if (fs.existsSync(fullPath)) {
                        const stat = fs.statSync(fullPath);
                        const endTs = stat.mtimeMs;
                        const startTs = endTs - (CONFIG.SEGMENT_DURATION * 1000);

                        redis.xadd(CONFIG.REDIS_STREAM_KEY, "*",
                            "type", "record.segment.v2",
                            "cameraId", id,
                            "startTs", startTs.toString(),
                            "endTs", endTs.toString(),
                            "durationMs", (endTs - startTs).toString(),
                            "path", fullPath
                        );
                    }
                    // Periodic mkdir for next potential hour
                    const nextHour = new Date(Date.now() + 3600000);
                    const nextPath = path.join(CONFIG.STORAGE_ROOT, id,
                        String(nextHour.getFullYear()),
                        String(nextHour.getMonth() + 1).padStart(2, '0'),
                        String(nextHour.getDate()).padStart(2, '0'),
                        String(nextHour.getHours()).padStart(2, '0')
                    );
                    ensureDir(nextPath);
                });
            } catch (e) { }
        }
    }
}

new RecorderV2().start();
