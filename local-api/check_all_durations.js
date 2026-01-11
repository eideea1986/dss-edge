const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const STORAGE_ROOT = '/opt/dss-edge/storage';
const dirs = fs.readdirSync(STORAGE_ROOT).filter(d => d.startsWith('cam_'));

dirs.forEach(camId => {
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (fs.existsSync(dbPath)) {
        const db = new sqlite3.Database(dbPath);
        db.get("SELECT COUNT(*) as count, AVG(end_ts - start_ts) as avgDur FROM segments WHERE end_ts > 0", (err, row) => {
            if (row && row.count > 0) {
                console.log(`${camId}: ${row.count} segments, Avg Duration: ${(row.avgDur / 1000).toFixed(2)}s`);
                if (row.avgDur < 5000) {
                    console.log(`  WARNING: Tiny segments detected for ${camId}`);
                }
            }
            db.close();
        });
    }
});
