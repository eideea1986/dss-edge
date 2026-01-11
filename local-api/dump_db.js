const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = '/opt/dss-edge/storage/cam_34b5a397/index.db';
const db = new sqlite3.Database(dbPath);

db.all("SELECT start_ts, end_ts, file FROM segments ORDER BY start_ts DESC LIMIT 10", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('--- RECENT SEGMENTS cam_34b5a397 ---');
        console.table(rows);
    }
    db.close();
});
