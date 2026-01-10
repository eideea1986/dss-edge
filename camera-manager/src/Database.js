const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        const dbDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

        this.db = new sqlite3.Database(path.join(dbDir, 'nvr_index.db'));
        this.init();
    }

    init() {
        this.db.serialize(() => {
            // Index pentru segmente video
            this.db.run(`CREATE TABLE IF NOT EXISTS segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cam_id TEXT,
                start_ts INTEGER,
                end_ts INTEGER,
                duration REAL,
                file_path TEXT,
                type TEXT -- 'motion' sau 'continuous'
            )`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_segments_cam_ts ON segments(cam_id, start_ts)`);

            // Index pentru evenimente AI
            this.db.run(`CREATE TABLE IF NOT EXISTS ai_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cam_id TEXT,
                timestamp INTEGER,
                label TEXT, -- 'person', 'car', etc.
                zones TEXT, -- JSON array de zone
                snapshot_path TEXT
            )`);
        });
    }

    addSegment(camId, startTs, endTs, duration, filePath, type) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO segments (cam_id, start_ts, end_ts, duration, file_path, type) VALUES (?, ?, ?, ?, ?, ?)`,
                [camId, startTs, endTs, duration, filePath, type],
                (err) => err ? reject(err) : resolve()
            );
        });
    }

    querySegments(camId, fromTs, toTs) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM segments WHERE cam_id = ? AND end_ts >= ? AND start_ts <= ? ORDER BY start_ts ASC`,
                [camId, fromTs, toTs],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });
    }
}

module.exports = new Database();
