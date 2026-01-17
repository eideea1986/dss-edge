const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const CAM_ID = 'cam_34b5a397';
const STORAGE_ROOT = '/opt/dss-edge/storage';
const CAM_DIR = path.join(STORAGE_ROOT, CAM_ID);
const DB_PATH = path.join(CAM_DIR, 'index.db');

const SEGMENT_DURATION_SEC = 3;

async function reindex() {
    console.log(`Re-indexing ${CAM_ID}...`);

    if (!fs.existsSync(CAM_DIR)) {
        console.error("Camera dir not found!");
        return;
    }

    // Initialize DB
    const db = new sqlite3.Database(DB_PATH);
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_ts INTEGER,
            end_ts INTEGER,
            file TEXT,
            type TEXT DEFAULT 'segment'
        )`, (err) => err ? reject(err) : resolve());
    });

    // Clear existing (optional, but safer for re-run)
    // await new Promise(r => db.run("DELETE FROM segments", r));

    // Find date directories
    const years = fs.readdirSync(CAM_DIR).filter(f => /^\d{4}/.test(f)); // Matches 2026, 2026-XX-XX

    let totalInserted = 0;

    for (const item of years) {
        const fullPath = path.join(CAM_DIR, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // If it's a date dir like 2026-01-15, scan it
            // If it's a year dir 2026, check children
            if (item.length === 4) {
                // It's a year, go deeper
                // Skipping for simplicity unless needed, based on ls output we saw 2026-01-15
            }

            if (item.includes('-')) {
                console.log(`Scanning ${item}...`);
                const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.mp4'));

                db.serialize(() => {
                    const stmt = db.prepare("INSERT INTO segments (start_ts, end_ts, file, type) VALUES (?, ?, ?, ?)");

                    db.run("BEGIN TRANSACTION");
                    files.forEach(f => {
                        // seg_1768489892_100.mp4
                        const parts = f.replace('seg_', '').replace('.mp4', '').split('_');
                        if (parts.length === 2) {
                            const sessionStart = parseInt(parts[0]);
                            const index = parseInt(parts[1]);

                            const startTs = (sessionStart + (index * SEGMENT_DURATION_SEC)) * 1000;
                            const endTs = startTs + (SEGMENT_DURATION_SEC * 1000);
                            const relFile = path.join(item, f).replace(/\\/g, '/'); // 2026-01-15/seg_...

                            stmt.run(startTs, endTs, relFile, 'segment');
                            totalInserted++;
                        }
                    });
                    db.run("COMMIT");
                });
            }
        }
    }

    console.log(`Done. Inserted ${totalInserted} segments.`);
    db.close();
}

reindex();
