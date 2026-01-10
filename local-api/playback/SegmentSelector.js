const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const STORAGE_ROOT = '/opt/dss-edge/recorder/storage';

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

function getOne(db, query, params) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function selectSegments(camId, startTs, windowMs) {
    const db = getDb(camId);
    if (!db) {
        console.error(`[SegmentSelector] DB not found for ${camId}`);
        return [];
    }

    try {
        // 1. Find the segment containing the startTs OR the one immediately before
        const anchorQuery = `
            SELECT filename, start_ts, end_ts
            FROM segments
            WHERE type='segment' AND start_ts <= ?
            ORDER BY start_ts DESC
            LIMIT 1
        `;

        const anchor = await getOne(db, anchorQuery, [startTs]);

        if (!anchor) {
            console.log(`[SegmentSelector] No anchor segment found for ${startTs}`);
            return []; // Or handle forward search
        }

        // 2. Select segments from the anchor onwards for the duration of the window
        const listQuery = `
            SELECT filename, start_ts, end_ts
            FROM segments
            WHERE type='segment' AND start_ts >= ?
            ORDER BY start_ts ASC
            LIMIT 100
        `;

        // We start searching from the anchor's start_ts to include it
        const rows = await runQuery(db, listQuery, [anchor.start_ts]);

        // Filter to ensure we cover the window (basic filtering)
        // Note: The SQLite query gets next 100 segments which is usually enough for a window
        return rows.map(r => ({
            file_path: path.join(STORAGE_ROOT, camId, r.filename),
            start_ts: r.start_ts,
            end_ts: r.end_ts
        }));

    } catch (e) {
        console.error(`[SegmentSelector] Error:`, e);
        return [];
    } finally {
        db.close();
    }
}

module.exports = { selectSegments };
