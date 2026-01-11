const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const camId = process.argv[2] || 'cam_34b5a397';
const dbPath = path.join('/opt/dss-edge/storage', camId, 'index.db');

if (!fs.existsSync(dbPath)) {
    console.log(`DB NOT FOUND: ${dbPath}`);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);
db.all("SELECT id, start_ts, end_ts, (end_ts - start_ts) as dur, file FROM segments ORDER BY id DESC LIMIT 50", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(`--- LAST 50 SEGMENTS FOR ${camId} ---`);
        rows.forEach(r => {
            const startStr = new Date(r.start_ts).toLocaleString();
            const endStr = r.end_ts === 0 ? 'OPEN' : new Date(r.end_ts).toLocaleString();
            console.log(`ID: ${r.id} | Start: ${startStr} (${r.start_ts}) | End: ${endStr} (${r.end_ts}) | Dur: ${r.dur}ms | File: ${r.file}`);
        });
    }
    db.close();
});
