/**
 * DSS Storage Indexer (Legacy Compatibility Mode)
 * - Consumes 'storage:segments' Redis Stream
 * - Updates Legacy SQLite DBs (Schema: id, file, start_ts, end_ts, type)
 */

const Redis = require("ioredis");
const sqlite3 = require("/opt/dss-edge/local-api/node_modules/sqlite3");
const path = require("path");
const fs = require("fs");

const CONFIG = {
    REDIS_STREAM_KEY: "storage:segments",
    CONSUMER_GROUP: "indexer-group",
    CONSUMER_ID: "indexer-1",
    STORAGE_ROOT: "/opt/dss-edge/storage",
    HEARTBEAT_KEY: "hb:indexer"
};

const redis = new Redis();

async function getDatabase(camId) {
    const camDir = path.join(CONFIG.STORAGE_ROOT, camId);
    if (!fs.existsSync(camDir)) fs.mkdirSync(camDir, { recursive: true });

    const dbPath = path.join(camDir, 'index.db');
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) return reject(err);
            // Legacy Schema Match
            db.run(`CREATE TABLE IF NOT EXISTS segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file TEXT UNIQUE,
                start_ts INTEGER,
                end_ts INTEGER,
                type TEXT DEFAULT 'segment'
            )`, (err) => {
                if (err) reject(err); else resolve(db);
            });
        });
    });
}

async function index(seg) {
    try {
        const db = await getDatabase(seg.cameraId);
        // We want the relative path from the camera folder
        // fullPath: /opt/dss-edge/storage/camId/YYYY/MM/DD/HH/file.mp4
        // target: YYYY/MM/DD/HH/file.mp4
        const relativeFile = seg.path.split(seg.cameraId + '/')[1] || path.basename(seg.path);

        return new Promise((resolve, reject) => {
            db.run(`INSERT OR IGNORE INTO segments (file, start_ts, end_ts, type) VALUES (?, ?, ?, ?)`,
                [relativeFile, parseInt(seg.startTs), parseInt(seg.endTs), 'segment'],
                (err) => {
                    db.close();
                    if (err) reject(err); else resolve();
                }
            );
        });
    } catch (e) { console.error(`[INDEXER] ${e.message}`); }
}

async function run() {
    console.log("[INDEXER] Starting Legacy-Index Bridge...");
    try { await redis.xgroup("CREATE", CONFIG.REDIS_STREAM_KEY, CONFIG.CONSUMER_GROUP, "$", "MKSTREAM"); } catch (e) { }

    while (true) {
        try {
            const results = await redis.xreadgroup("GROUP", CONFIG.CONSUMER_GROUP, CONFIG.CONSUMER_ID, "COUNT", "10", "BLOCK", "5000", "STREAMS", CONFIG.REDIS_STREAM_KEY, ">");
            if (results) {
                for (const [stream, messages] of results) {
                    for (const [id, fields] of messages) {
                        const entry = {};
                        for (let i = 0; i < fields.length; i += 2) entry[fields[i]] = fields[i + 1];
                        if (entry.type === 'record.segment.v2') await index(entry);
                        await redis.xack(CONFIG.REDIS_STREAM_KEY, CONFIG.CONSUMER_GROUP, id);
                    }
                }
            }
            redis.set(CONFIG.HEARTBEAT_KEY, Date.now());
        } catch (e) {
            console.error("[INDEXER] Error:", e.message);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

run();
