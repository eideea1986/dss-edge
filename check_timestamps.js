const sqlite3 = require('sqlite3');
const path = require('path');

const camId = 'cam_34b5a397'; // Use camId from metadata/screenshot
const dbPath = `/opt/dss-edge/storage/${camId}/index.db`;

console.log(`Checking timestamps in ${dbPath}...`);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

db.all('SELECT id, start_ts, end_ts FROM segments ORDER BY id DESC LIMIT 20', (err, rows) => {
    if (err) {
        console.error('Error:', err);
        return;
    }

    const now = Date.now();
    console.log(`Current Epoch: ${now}`);
    console.log('--------------------------------------------------');
    console.log('ID\tSTART_TS\tEND_TS\t\tDIFF_FROM_NOW(h)');
    console.log('--------------------------------------------------');

    rows.forEach(r => {
        const diffH = (now - r.start_ts) / 3600000;
        console.log(`${r.id}\t${r.start_ts}\t${r.end_ts}\t${diffH.toFixed(2)}h`);
    });

    db.close();
});
