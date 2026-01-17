const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const STORAGE_ROOT = '/opt/dss-edge/storage';

function getDb(camId) {
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return null;
    return new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
}

function runQuery(db, query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getSegmentsForDay(camId, dateObj) {
    const y = String(dateObj.getFullYear());
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');

    const dayDir = path.join(STORAGE_ROOT, camId, y, m, d);
    if (!fs.existsSync(dayDir)) return [];

    let segments = [];

    const processFile = (f) => {
        try {
            const parts = f.replace('.mp4', '').split('-');
            if (parts.length < 3) return;

            const h = parseInt(parts[0]);
            const min = parseInt(parts[1]);
            const s = parseInt(parts[2]);

            const segDate = new Date(dateObj);
            segDate.setHours(h, min, s, 0);

            const start = segDate.getTime();
            const end = start + 60000;

            // Encode Date into Filename
            const filenameEncoded = `${y}-${m}-${d}_${f}`;

            segments.push({
                file_path: path.join(dayDir, f), // Note: This might need adjustment if in subfolder, but we scan recursively below?
                // Wait. If in subfolder, file_path must include subfolder.
                // The dayDir join above assumes root.
                // We need to pass the directory to processFile.
                start_ts: start,
                end_ts: end,
                filename: filenameEncoded
            });
        } catch (e) { }
    };

    // Refactored Process Dir to fix path
    const scanDir = (dir) => {
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp4'));
            files.forEach(f => {
                try {
                    const parts = f.replace('.mp4', '').split('-');
                    if (parts.length < 3) return;
                    const h = parseInt(parts[0]);
                    const min = parseInt(parts[1]);
                    const s = parseInt(parts[2]);

                    const segDate = new Date(dateObj);
                    segDate.setHours(h, min, s, 0);

                    // Encode
                    const filenameEncoded = `${y}-${m}-${d}_${f}`;

                    segments.push({
                        file_path: path.join(dir, f),
                        start_ts: segDate.getTime(),
                        end_ts: segDate.getTime() + 60000,
                        filename: filenameEncoded
                    });
                } catch (e) { }
            });
        } catch (e) { }
    };


    // 1. Scan Root
    scanDir(dayDir);

    // 2. Scan HH folders
    for (let i = 0; i < 24; i++) {
        const hh = String(i).padStart(2, '0');
        const hDir = path.join(dayDir, hh);
        if (fs.existsSync(hDir) && fs.statSync(hDir).isDirectory()) {
            scanDir(hDir);
        }
    }

    return segments.sort((a, b) => a.start_ts - b.start_ts);
}

function scanSegmentsFS(camId, startTs, windowMs) {
    const startDate = new Date(startTs);
    const endDate = new Date(startTs + windowMs);

    let segments = getSegmentsForDay(camId, startDate);

    if (endDate.getDate() !== startDate.getDate()) {
        const nextDay = new Date(startDate);
        nextDay.setDate(nextDay.getDate() + 1);
        segments = segments.concat(getSegmentsForDay(camId, nextDay));
    }

    const relevant = segments.filter(s => s.end_ts > startTs && s.start_ts < (startTs + windowMs));
    return relevant;
}

async function selectSegments(camId, startTs, windowMs) {
    const fsSegs = scanSegmentsFS(camId, startTs, windowMs);
    if (fsSegs.length > 0) return fsSegs;

    const db = getDb(camId);
    if (!db) return [];

    try {
        const anchorQuery = `SELECT filename, start_ts, end_ts FROM segments WHERE type='segment' AND start_ts <= ? ORDER BY start_ts DESC LIMIT 1`;
        const listQuery = `SELECT filename, start_ts, end_ts FROM segments WHERE type='segment' AND start_ts >= ? ORDER BY start_ts ASC LIMIT 100`;
        const getOne = (q, p) => new Promise((res, rej) => db.get(q, p, (e, r) => e ? rej(e) : res(r)));

        const anchor = await getOne(anchorQuery, [startTs]);
        if (!anchor) return [];

        const rows = await runQuery(db, listQuery, [anchor.start_ts]);
        return rows.map(r => ({
            file_path: path.join(STORAGE_ROOT, camId, r.filename),
            start_ts: r.start_ts,
            end_ts: r.end_ts,
            filename: r.filename
        }));
    } catch (e) { return []; } finally { db.close(); }
}

module.exports = { selectSegments };
