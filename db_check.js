const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('/opt/dss-edge/storage/cam_00e5d3a3/index.db', sqlite3.OPEN_READONLY);

console.log('=== DB Diagnostic ===\n');

// Check schema
db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
        console.log('Error reading schema:', err.message);
        db.close();
        return;
    }

    console.log('Tables:');
    tables.forEach(t => {
        console.log('  -', t.name);
        console.log('   ', t.sql);
    });

    // Check segments count
    db.get("SELECT COUNT(*) as count FROM segments", (err, row) => {
        if (err) {
            console.log('\nError counting segments:', err.message);
        } else {
            console.log('\nTotal segments:', row ? row.count : 0);
        }

        // Check all segments
        db.all("SELECT id, file, start_ts, end_ts FROM segments LIMIT 10", (err, rows) => {
            if (err) {
                console.log('Error selecting:', err.message);
            } else {
                console.log('\nFirst 10 segments:');
                if (rows && rows.length > 0) {
                    rows.forEach(r => {
                        const start_date = new Date(r.start_ts).toISOString();
                        const end_date = new Date(r.end_ts).toISOString();
                        console.log(`  ${r.id}: ${r.file} [${r.start_ts} (${start_date}) -> ${r.end_ts} (${end_date})]`);
                    });
                } else {
                    console.log('  (no segments)');
                }
            }
            db.close();
        });
    });
});
