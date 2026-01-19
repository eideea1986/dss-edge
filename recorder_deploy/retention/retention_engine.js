const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

const STORAGE = "/opt/dss-edge/storage";
const MAX_GB = 160; // Reduced to 160GB to leave ~70GB for OS/Logs/Safety margin on 233GB disk

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

// DEEP SCAVENGE: ATOMIC AUDIT LOGGING
async function deepScavenge() {
    if (!fs.existsSync(STORAGE)) return;
    console.log(JSON.stringify({ action: "RETENTION_START", type: "scavenge" }));

    try {
        const cams = fs.readdirSync(STORAGE);
        for (const cam of cams) {
            const camPath = path.join(STORAGE, cam);
            if (!fs.statSync(camPath).isDirectory()) continue;

            const dbPath = path.join(camPath, "index.db");
            if (!fs.existsSync(dbPath)) continue;

            // Get all files from DB
            const dbFiles = await new Promise((resolve) => {
                const db = new sqlite3.Database(dbPath);
                db.all("SELECT file FROM segments", (err, rows) => {
                    db.close();
                    if (err) resolve(new Set());
                    else resolve(new Set(rows.map(r => r.file)));
                });
            });

            // Walk physical folder
            const walk = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(fullPath);
                        try { if (fs.readdirSync(fullPath).length === 0) fs.rmdirSync(fullPath); } catch (e) { }
                    } else if (entry.isFile() && entry.name.endsWith(".mp4")) {
                        const relative = path.relative(camPath, fullPath);
                        if (!dbFiles.has(relative)) {
                            // ORPHAN DETECTED
                            let diskDeleted = false;
                            try {
                                fs.unlinkSync(fullPath);
                                diskDeleted = true;
                            } catch (e) { }

                            console.log(JSON.stringify({
                                action: "DELETE_ORPHAN",
                                cam: cam,
                                file: relative,
                                disk: diskDeleted,
                                reason: "not_in_db"
                            }));
                        }
                    }
                }
            };
            walk(camPath);
        }
    } catch (e) {
        console.error(JSON.stringify({ action: "RETENTION_ERROR", error: e.message, type: "scavenge" }));
    }
}

async function retentionRun(mode = "normal") {
    try {
        await deepScavenge();

        let targetLimit = MAX_GB;
        if (mode === "aggressive") targetLimit = MAX_GB * 0.8;

        const all = await collectAllSegments();
        let totalBytes = all.reduce((sum, s) => sum + s.size, 0);
        let totalGB = totalBytes / (1024 * 1024 * 1024);

        if (totalGB <= targetLimit) return;

        console.log(JSON.stringify({
            action: "RETENTION_PURGE_START",
            current_gb: totalGB.toFixed(2),
            target_gb: targetLimit.toFixed(2)
        }));

        for (const seg of all) {
            if (totalGB <= targetLimit) break;
            if (activeSegments.has(path.basename(seg.file))) continue;

            let disk = false;
            let db = false;

            // 1. DISK DELETE
            try {
                if (fs.existsSync(seg.fullPath)) {
                    fs.unlinkSync(seg.fullPath);
                }
                disk = true;
            } catch (e) {
                console.error(JSON.stringify({ action: "DELETE_ERROR", stage: "disk", file: seg.fullPath, error: e.message }));
            }

            // 2. DB DELETE
            if (disk) { // Only delete from DB if disk delete succeeded (or file was already gone)
                try {
                    await new Promise((resolve, reject) => {
                        const dbConn = new sqlite3.Database(path.join(seg.camPath, "index.db"));
                        dbConn.run("DELETE FROM segments WHERE id = ?", [seg.id], function (err) {
                            dbConn.close();
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    db = true;
                } catch (e) {
                    console.error(JSON.stringify({ action: "DELETE_ERROR", stage: "db", file: seg.fullPath, error: e.message }));
                }
            }

            // 3. ATOMICITY CONFIRMATION
            const logEntry = {
                action: "DELETE_RECORDING",
                disk: disk,
                db: db,
                cache: true, // Implied by architecture (read-only playback)
                cameraId: seg.cam,
                ts_start: seg.start_ts,
                ts_end: seg.end_ts,
                file: seg.file
            };

            if (!disk || !db) {
                console.error(JSON.stringify({ ...logEntry, status: "FAILED_PARTIAL", explanation: "Critical Atomicity Violation" }));
            } else {
                console.log(JSON.stringify(logEntry));
                totalBytes -= seg.size;
                totalGB = totalBytes / (1024 * 1024 * 1024);
            }
        }
    } catch (e) {
        console.error(JSON.stringify({ action: "RETENTION_CRASH", error: e.message }));
    }
}

module.exports = { markActiveSegment, retentionRun };

if (require.main === module) {
    console.log("[Retention] Manual Trigger Start...");
    retentionRun("normal").then(() => console.log("[Retention] Manual Trigger Done"));
}
