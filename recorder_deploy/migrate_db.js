const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const STORAGE = "/opt/dss-edge/storage";

function migrate() {
    if (!fs.existsSync(STORAGE)) return;
    const cams = fs.readdirSync(STORAGE);
    for (const cam of cams) {
        const camPath = path.join(STORAGE, cam);
        if (!fs.statSync(camPath).isDirectory()) continue;

        const dbPath = path.join(camPath, 'index.db');
        const db = new sqlite3.Database(dbPath);

        db.serialize(() => {
            // Correct Schema: file, start_ts, end_ts
            db.run("CREATE TABLE IF NOT EXISTS segments (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT, start_ts INTEGER, end_ts INTEGER)");
            db.run("CREATE INDEX IF NOT EXISTS idx_start ON segments(start_ts)");

            const dates = fs.readdirSync(camPath);
            for (const date of dates) {
                const datePath = path.join(camPath, date);
                if (!fs.statSync(datePath).isDirectory()) continue;

                const indexPath = path.join(datePath, 'index.json');
                if (!fs.existsSync(indexPath)) continue;

                try {
                    const index = JSON.parse(fs.readFileSync(indexPath));
                    index.segments.forEach(seg => {
                        db.run("INSERT INTO segments (file, start_ts, end_ts) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM segments WHERE file = ?)",
                            [seg.file, seg.start * 1000, (seg.start + (seg.duration || 3)) * 1000, seg.file]);
                    });
                } catch (e) { }
            }
        });
        console.log("Migrated " + cam);
    }
}
migrate();
