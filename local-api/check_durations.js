const sqlite3 = require('sqlite3');
const path = require('path');

const camId = 'cam_34b5a397';
const dbPath = path.join('/opt/dss-edge/storage', camId, 'index.db');

if (!require('fs').existsSync(dbPath)) {
    console.log('DB NOT FOUND');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);
db.all("SELECT id, start_ts, end_ts, (end_ts - start_ts) as dur FROM segments ORDER BY start_ts DESC LIMIT 10", (err, rows) => {
    if (err) console.error(err);
    else console.table(rows);
    db.close();
});
