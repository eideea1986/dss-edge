const sqlite3 = require('sqlite3');
const path = require('path');

const camId = 'cam_34b5a397';
const dbPath = `/opt/dss-edge/storage/${camId}/index.db`;
const db = new sqlite3.Database(dbPath);

const target = parseInt(process.argv[2]);

console.log(`Searching around: ${target} (${new Date(target).toLocaleString()})`);

db.all("SELECT start_ts, end_ts, file FROM segments WHERE start_ts <= ? ORDER BY start_ts DESC LIMIT 5", [target], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('--- SEGMENTS BEFORE ---');
        console.table(rows);
    }
    db.all("SELECT start_ts, end_ts, file FROM segments WHERE start_ts > ? ORDER BY start_ts ASC LIMIT 5", [target], (err2, rows2) => {
        if (err2) {
            console.error(err2);
        } else {
            console.log('--- SEGMENTS AFTER ---');
            console.table(rows2);
        }
        db.close();
    });
});
