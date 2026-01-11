const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = '/opt/dss-edge/storage/cam_34b5a397/index.db';
const db = new sqlite3.Database(dbPath);

const dayStart = 1768082400000; // 2026-01-11 00:00 approx
const dayEnd = dayStart + 86400000;

console.log('--- SCANNING DB cam_34b5a397 ---');
db.all("SELECT start_ts, end_ts, file FROM segments ORDER BY start_ts ASC", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('Total Segments:', rows.length);
        const today = rows.filter(r => r.start_ts >= dayStart && r.start_ts < dayEnd);
        console.log('Segments Today (expected):', today.length);
        if (today.length > 0) {
            console.table(today.slice(0, 5));
        } else {
            console.log('NO SEGMENTS IN TODAY RANGE');
            console.log('First segment:', rows[0]?.start_ts);
            console.log('Last segment:', rows[rows.length - 1]?.start_ts);
        }
    }
    db.close();
});
