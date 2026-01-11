const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const STORAGE_ROOT = '/opt/dss-edge/storage';
const camId = 'cam_11b94237';
const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');

if (!fs.existsSync(dbPath)) {
    console.error('DB NOT FOUND at', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);
db.get("SELECT * FROM segments LIMIT 1", (err, row) => {
    if (err) {
        console.error(err);
    } else {
        console.log('SEGMENT DATA:', JSON.stringify(row, null, 2));
        if (row) {
            const fullPath = path.join(STORAGE_ROOT, camId, row.file);
            console.log('EXPECTED PATH:', fullPath);
            console.log('EXISTS:', fs.existsSync(fullPath));

            // Check if it's in a subfolder
            const subPath = path.join(STORAGE_ROOT, camId, 'segments', row.file);
            console.log('SUBFOLDER PATH:', subPath);
            console.log('SUBFOLDER EXISTS:', fs.existsSync(subPath));
        }
    }
    db.close();
});
