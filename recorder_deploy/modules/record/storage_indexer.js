/**
 * DSS Storage Indexer (Legacy Compatibility Mode)
 * - Consumes 'storage:segments' Redis Stream
 * - Updates Legacy SQLite DBs (Schema: id, file, start_ts, end_ts, type)
 * - Supports --rebuild mode
 */

const Redis = require("ioredis");
const sqlite3 = require("/opt/dss-edge/local-api/node_modules/sqlite3").verbose();
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
const READY_FILE = "/run/dss/index.ready";

// --- HELPERS ---
function signalReady() {
    try { fs.writeFileSync(READY_FILE, Date.now().toString()); } catch (e) { }
}

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

// --- INDEX LOGIC ---
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
            // Fallback logic for flat/hierarchical mismatch
            const pathParts = actualPath.split('/');
            const fileName = pathParts[pathParts.length - 1];
            // Try to construct relative anyway or skip
            relativeFile = fileName; // Simplified fallback
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

// --- REBUILD MODE ---
async function rebuild() {
    console.log("[INDEXER] Starting Full Index Rebuild...");
    if (!fs.existsSync(CONFIG.STORAGE_ROOT)) return;

    const cams = fs.readdirSync(CONFIG.STORAGE_ROOT);
    for (const cam of cams) {
        const camPath = path.join(CONFIG.STORAGE_ROOT, cam);
        if (!fs.statSync(camPath).isDirectory()) continue;

        console.log(`[INDEXER] Rebuilding ${cam}...`);

        // 1. Reset DB
        const dbPath = path.join(camPath, 'index.db');
        const db = await getDatabase(cam);
        await new Promise(r => db.run("DELETE FROM segments", r));

        // 2. Scan Disk (Recursive)
        const files = [];
        const walk = (dir) => {
            const list = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of list) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) walk(fullPath);
                else if (item.name.endsWith(".mp4")) files.push(fullPath);
            }
        };
        walk(camPath);

        // 3. Insert Re-discovered
        db.serialize(() => {
            const stmt = db.prepare("INSERT OR IGNORE INTO segments (file, start_ts, end_ts, type) VALUES (?, ?, ?, ?)");
            files.forEach(f => {
                const rel = path.relative(camPath, f);
                try {
                    const stats = fs.statSync(f);
                    const endTs = stats.mtimeMs;
                    // Approximate start (5s duration default or from filename)
                    const startTs = endTs - 5000;
                    stmt.run(rel, startTs, endTs, 'segment');
                } catch (e) { }
            });
            stmt.finalize();
        });

        await new Promise(r => db.close(r));
        console.log(`[INDEXER] ${cam} done. Indexed ${files.length} files.`);
    }
    console.log("[INDEXER] Rebuild Complete.");
    signalReady();
    process.exit(0);
}

// --- MAIN RUN LOOP ---
async function run() {
    console.log("[INDEXER] Starting Legacy-Index Bridge...");
    // Clear old ready flag on startup
    try { if (fs.existsSync(READY_FILE)) fs.unlinkSync(READY_FILE); } catch (e) { }

    try { await redis.xgroup("CREATE", CONFIG.REDIS_STREAM_KEY, CONFIG.CONSUMER_GROUP, "$", "MKSTREAM"); } catch (e) { }

    let initialCatchUpDone = false;

    while (true) {
        try {
            const results = await redis.xreadgroup("GROUP", CONFIG.CONSUMER_GROUP, CONFIG.CONSUMER_ID, "COUNT", "10", "BLOCK", "5000", "STREAMS", CONFIG.REDIS_STREAM_KEY, ">");

            if (!initialCatchUpDone) {
                initialCatchUpDone = true;
                signalReady();
            }

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

// ENTRY POINT
if (process.argv.includes("--rebuild")) {
    rebuild();
} else {
    run();
}
