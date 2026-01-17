const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

const STORAGE = "/opt/dss-edge/storage";
const MAX_GB = 400; // Increased to 400GB for safety

let activeSegments = new Set();

function markActiveSegment(file) {
    const filename = path.basename(file);
    activeSegments.add(filename);
    setTimeout(() => activeSegments.delete(filename), 5 * 60 * 1000);
}

// Scans all index.db files and collects segments sorted by time
async function collectAllSegments() {
    const all = [];
    if (!fs.existsSync(STORAGE)) return [];

    try {
        const cams = fs.readdirSync(STORAGE);
        for (const cam of cams) {
            const camPath = path.join(STORAGE, cam);
            if (!fs.statSync(camPath).isDirectory()) continue;

            const dbPath = path.join(camPath, "index.db");
            if (!fs.existsSync(dbPath)) continue;

            // Query DB for segments
            const segments = await new Promise((resolve) => {
                const db = new sqlite3.Database(dbPath);
                db.all("SELECT * FROM segments ORDER BY start_ts ASC", (err, rows) => {
                    db.close();
                    if (err) resolve([]);
                    else resolve(rows.map(r => ({ ...r, cam, camPath })));
                });
            });

            for (const s of segments) {
                const fullPath = path.join(camPath, s.file);
                if (fs.existsSync(fullPath)) {
                    all.push({
                        ...s,
                        fullPath,
                        size: fs.statSync(fullPath).size
                    });
                }
            }
        }
    } catch (e) {
        console.error("[Retention] Collect Error:", e);
    }

    return all.sort((a, b) => a.start_ts - b.start_ts);
}

async function retentionRun() {
    try {
        const all = await collectAllSegments();
        let totalBytes = all.reduce((sum, s) => sum + s.size, 0);
        let totalGB = totalBytes / (1024 * 1024 * 1024);

        console.log(`[Retention] Usage: ${totalGB.toFixed(2)} GB / ${MAX_GB} GB (${all.length} segments)`);

        if (totalGB <= MAX_GB) return;

        console.log(`[Retention] Over limit. Purging oldest segments...`);

        for (const seg of all) {
            if (totalGB <= MAX_GB) break;

            // Don't delete segments written in the last 5 minutes
            if (activeSegments.has(path.basename(seg.file))) continue;

            try {
                if (fs.existsSync(seg.fullPath)) {
                    fs.unlinkSync(seg.fullPath);
                }

                // Remove from DB
                await new Promise((resolve) => {
                    const db = new sqlite3.Database(path.join(seg.camPath, "index.db"));
                    db.run("DELETE FROM segments WHERE id = ?", [seg.id], () => {
                        db.close();
                        resolve();
                    });
                });

                totalBytes -= seg.size;
                totalGB = totalBytes / (1024 * 1024 * 1024);
                // console.log(`[Retention] Removed ${seg.fullPath}`);
            } catch (e) {
                console.error(`[Retention] Failed to purge ${seg.fullPath}:`, e.message);
            }
        }
    } catch (e) {
        console.error("[Retention] Run Error:", e);
    }
}

module.exports = { markActiveSegment, retentionRun };
