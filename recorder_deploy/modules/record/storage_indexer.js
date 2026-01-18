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

        // TRUTH VERIFICATION: Check if the path from event actually exists
        let actualPath = seg.path;
        let relativeFile = null;

        if (fs.existsSync(actualPath)) {
            // Path exists as-is (hierarchical format)
            relativeFile = seg.path.split(seg.cameraId + '/')[1] || path.basename(seg.path);
        } else {
            // Path doesn't exist - derive FLAT format equivalent
            // Event path: /opt/dss-edge/storage/cam_xxx/2026/01/17/09/17-05.mp4
            // Flat format: /opt/dss-edge/storage/cam_xxx/2026-01-17_09-17-05.mp4

            const pathParts = actualPath.split('/');
            const fileName = pathParts[pathParts.length - 1]; // "17-05.mp4"
            const hour = pathParts[pathParts.length - 2];      // "09"
            const day = pathParts[pathParts.length - 3];       // "17"
            const month = pathParts[pathParts.length - 4];     // "01"
            const year = pathParts[pathParts.length - 5];      // "2026"

            // Construct flat filename: YYYY-MM-DD_HH-MM-SS.mp4
            const [minute, second] = fileName.replace('.mp4', '').split('-');
            const flatFileName = `${year}-${month}-${day}_${hour}-${minute}-${second}.mp4`;

            const camDir = path.join(CONFIG.STORAGE_ROOT, seg.cameraId);
            const flatPath = path.join(camDir, flatFileName);

            if (fs.existsSync(flatPath)) {
                // Found the real file in flat format
                actualPath = flatPath;
                relativeFile = flatFileName;
                console.log(`[INDEXER] Path mismatch resolved: ${path.basename(seg.path)} -> ${flatFileName}`);
            } else {
                // File doesn't exist in either format - skip indexing
                console.warn(`[INDEXER] File not found (tried both formats): ${seg.path}`);
                db.close();
                return;
            }
        }

        return new Promise((resolve, reject) => {
            db.run(`INSERT OR IGNORE INTO segments (file, start_ts, end_ts, type) VALUES (?, ?, ?, ?)`,
                [relativeFile, parseInt(seg.startTs), parseInt(seg.endTs), 'segment'],
                (err) => {
                    db.close();
                    if (err) reject(err); else resolve();
                }
            );
        });
    } catch (e) {
        console.error(`[INDEXER] Error indexing segment:`, e.message);
    }
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
