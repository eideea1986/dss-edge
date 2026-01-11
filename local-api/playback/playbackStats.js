const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

const getStats = (req, res) => {
    const { camId } = req.params;
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');

    if (!fs.existsSync(dbPath)) return res.json({ first: null, last: null });

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    db.get("SELECT MIN(start_ts) as first, MAX(end_ts) as last FROM segments", (err, row) => {
        db.close();
        if (err) {
            console.error("Stats DB Error:", err);
            return res.status(500).send("DB Error");
        }
        res.json(row || { first: null, last: null });
    });
};

const getTimelineDay = (req, res) => {
    const { camId, date } = req.params;
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');

    if (!fs.existsSync(dbPath)) return res.json({ segments: [], dayStart: 0 });

    // Parse date (YYYY-MM-DD)
    const parts = date.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);

    const targetDate = new Date(year, month, day);
    const dayStart = targetDate.setHours(0, 0, 0, 0);
    const dayEnd = targetDate.setHours(23, 59, 59, 999);

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    const sql = `SELECT start_ts, end_ts, file FROM segments WHERE start_ts >= ? AND start_ts <= ? ORDER BY start_ts ASC`;

    db.all(sql, [dayStart, dayEnd], (err, rows) => {
        db.close();
        if (err) {
            console.error("Timeline DB Error:", err);
            return res.status(500).send("DB Error");
        }
        res.json({
            dayStart,
            segments: rows || []
        });
    });
};

module.exports = { getStats, getTimelineDay };
