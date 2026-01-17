const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const REMOTE_FILE = '/opt/dss-edge/local-api/playback/SegmentSelector.js';

const CONTENT = `const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

// Corrected Storage Path matching Orchestrator
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

// --- FILESYSTEM SCANNER (Enterprise Fallback) ---
function getSegmentsForDay(camId, dateObj) {
    const y = String(dateObj.getFullYear());
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    
    // Check for HH subfolders OR direct files
    // Strategy: We check if there are subfolders 00..23
    const dayDir = path.join(STORAGE_ROOT, camId, y, m, d);
    if (!fs.existsSync(dayDir)) return [];

    let segments = [];

    // Helper to process a directory of files
    const processDir = (dir, customDateSetter) => {
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp4'));
            files.forEach(f => {
                const parts = f.replace('.mp4', '').split('-');
                if (parts.length < 3) return;
                
                const h = parseInt(parts[0]);
                const min = parseInt(parts[1]);
                const s = parseInt(parts[2]);
                
                let segDate = new Date(dateObj);
                if (customDateSetter) {
                    segDate = customDateSetter(h, min, s);
                } else {
                    segDate.setHours(h, min, s, 0);
                }
                
                const start = segDate.getTime();
                const end = start + 60000;
                
                // Encode Date into Filename for safely retrieval later (needed by playbackController)
                const filenameEncoded = \`\${y}-\${m}-\${d}_\${f}\`;

                segments.push({
                    file_path: path.join(dir, f),
                    start_ts: start,
                    end_ts: end,
                    filename: filenameEncoded 
                });
            });
        } catch(e) {}
    };

    // 1. Check for HH folders (Orchestrator Style)
    let foundSubfolders = false;
    for (let i=0; i<24; i++) {
        const hh = String(i).padStart(2, '0');
        const hourDir = path.join(dayDir, hh);
        if (fs.existsSync(hourDir) && fs.statSync(hourDir).isDirectory()) {
            foundSubfolders = true;
            processDir(hourDir, (h, min, s) => {
                const d = new Date(dateObj);
                d.setHours(parseInt(hh), min, s, 0); // Force hour from folder
                return d;
            });
        }
    }

    // 2. If no subfolders (or mixed), check root day dir (Legacy/Flat Style)
    if (!foundSubfolders) {
        processDir(dayDir, null);
    } else {
        // Double check root just in case specific files are there
        processDir(dayDir, null);
    }
    
    return segments.sort((a,b) => a.start_ts - b.start_ts);
}

function scanSegmentsFS(camId, startTs, windowMs) {
    const startDate = new Date(startTs);
    const endDate = new Date(startTs + windowMs);
    
    let segments = getSegmentsForDay(camId, startDate);
    
    // If window crosses midnight, fetch next day too
    if (endDate.getDate() !== startDate.getDate()) {
        const nextDay = new Date(startDate);
        nextDay.setDate(nextDay.getDate() + 1);
        segments = segments.concat(getSegmentsForDay(camId, nextDay));
    }
    
    // Filter relevant segments
    const relevant = segments.filter(s => s.end_ts > startTs && s.start_ts < (startTs + windowMs));
    
    return relevant;
}

// --- MAIN SELECTOR ---
async function selectSegments(camId, startTs, windowMs) {
    // 1. Try Filesystem Logic First (Active System)
    const fsSegs = scanSegmentsFS(camId, startTs, windowMs);
    if (fsSegs.length > 0) {
        return fsSegs;
    }

    // 2. Try DB Logic
    const db = getDb(camId);
    if (!db) return [];

    try {
        const anchorQuery = \`SELECT filename, start_ts, end_ts FROM segments WHERE type='segment' AND start_ts <= ? ORDER BY start_ts DESC LIMIT 1\`;
        const listQuery = \`SELECT filename, start_ts, end_ts FROM segments WHERE type='segment' AND start_ts >= ? ORDER BY start_ts ASC LIMIT 100\`;
        
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
    } catch (e) {
        console.error(\`[SegmentSelector] DB Usage Error:\`, e);
        return [];
    } finally {
        db.close();
    }
}

module.exports = { selectSegments };
`;

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Force Writing SegmentSelector.js');
    // Escape backticks for shell command if needed, but best to use sftp writeStream
    conn.sftp((err, sftp) => {
        if (err) throw err;
        const stream = sftp.createWriteStream(REMOTE_FILE);
        stream.write(CONTENT);
        stream.end();
        stream.on('close', () => {
            console.log("Write Complete. Restarting API...");
            conn.exec('pm2 restart dss-edge-api', (err, stream) => {
                stream.on('close', () => {
                    console.log("API Restarted.");
                    conn.end();
                });
            });
        });
    });
}).connect(config);
