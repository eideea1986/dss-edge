const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = '/opt/dss-edge/storage/cam_34b5a397/index.db';
const db = new sqlite3.Database(dbPath);

db.get("SELECT MIN(start_ts) as min_ts, MAX(start_ts) as max_ts, COUNT(*) as count FROM segments", (err, stats) => {
    if (err) {
        console.error(err);
    } else {
        console.log('--- STATS cam_34b5a397 ---');
        if (stats) {
            console.log(`Count: ${stats.count}`);
            console.log(`Min: ${stats.min_ts} (${new Date(stats.min_ts).toLocaleString()})`);
            console.log(`Max: ${stats.max_ts} (${new Date(stats.max_ts).toLocaleString()})`);
        }
    }
    db.all("SELECT start_ts, end_ts, file FROM segments ORDER BY start_ts DESC LIMIT 20", (err, rows) => {
        if (!err) {
            console.log('--- RECENT SEGMENTS ---');
            console.table(rows);
        }
        db.close();
    });
});
