const sqlite3 = require('sqlite3');
const path = require('path');

const camId = 'cam_ccb3aba7';
const dbPath = path.join('/opt/dss-edge/storage', camId, 'index.db');
const db = new sqlite3.Database(dbPath);

// Target time: 13:51 (today)
const target = new Date();
target.setHours(13, 51, 0, 0);
const ts = target.getTime();

console.log(`Searching around ${target.toLocaleString()} (${ts})`);

db.all("SELECT id, start_ts, end_ts, (end_ts - start_ts) as dur, file FROM segments WHERE start_ts > ? - 60000 AND start_ts < ? + 60000", [ts, ts], (err, rows) => {
    if (err) console.error(err);
    else console.table(rows);
    db.close();
});
