const sqlite3 = require('sqlite3');
const path = require('path');

const camId = 'cam_34b5a397';
const dbPath = path.join('/opt/dss-edge/storage', camId, 'index.db');

const db = new sqlite3.Database(dbPath);
db.all("SELECT id, start_ts, end_ts, (end_ts - start_ts) as dur FROM segments WHERE dur < 5000 ORDER BY id DESC LIMIT 20", (err, rows) => {
    if (err) console.error(err);
    else {
        console.log('--- TINY SEGMENTS (< 5s) ---');
        console.table(rows);
    }
    db.close();
});
