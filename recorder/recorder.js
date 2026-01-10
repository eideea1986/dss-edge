const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const sqlite3 = require('sqlite3');

// === CONFIG ===
const SEG_DURATION = 1;
const CONFIG_PATH = path.resolve(__dirname, '../config/cameras.json');
const STORAGE_ROOT = path.join(__dirname, 'storage');

if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

function formatTime(ms) {
    const d = new Date(ms);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const mmm = d.getMilliseconds().toString().padStart(3, '0');
    return `${hh}${mm}${ss}_${mmm}`;
}

function log(camId, msg) {
    const time = new Date().toISOString().substring(11, 19);
    console.log(`[${time}] [${camId || 'System'}] ${msg}`);
}

function readConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return [];
        let raw = fs.readFileSync(CONFIG_PATH);
        if (raw[0] === 0xFF && raw[1] === 0xFE) return JSON.parse(raw.toString('ucs2'));
        if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) return JSON.parse(raw.slice(3).toString('utf8'));
        return JSON.parse(raw.toString('utf8'));
    } catch (e) {
        log(null, "Config Read Error: " + e.message);
        return [];
    }
}

// === SQLite Indexer ===
const dbs = new Map();

function getDB(camId) {
    if (dbs.has(camId)) return dbs.get(camId);

    const camDir = path.join(STORAGE_ROOT, camId);
    if (!fs.existsSync(camDir)) fs.mkdirSync(camDir, { recursive: true });

    const dbPath = path.join(camDir, 'index.db');
    const isNew = !fs.existsSync(dbPath);
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
        db.run("PRAGMA journal_mode = WAL");
        db.run("PRAGMA synchronous = NORMAL");
        db.run(`CREATE TABLE IF NOT EXISTS segments (
            start_ts INTEGER PRIMARY KEY,
            end_ts INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            filename TEXT,
            type TEXT DEFAULT 'segment'
        )`);
        db.run("CREATE INDEX IF NOT EXISTS idx_type_start ON segments(type, start_ts)");

        if (isNew) {
            log(camId, "Starting .idx migration...");
            const files = fs.readdirSync(camDir);
            files.forEach(f => {
                if (f.endsWith('.idx.migrated')) return;
                if (f.endsWith('.idx')) {
                    const p = path.join(camDir, f);
                    try {
                        const content = fs.readFileSync(p, 'utf8');
                        const lines = content.trim().split('\n');
                        const dayStr = f.replace('.idx', '');
                        db.run("BEGIN TRANSACTION");
                        lines.forEach(l => {
                            const p1 = l.split('|');
                            if (p1.length >= 3) {
                                const ts = parseInt(p1[0]);
                                const dur = parseInt(p1[1]);
                                const file = p1[2];
                                db.run("INSERT OR IGNORE INTO segments (start_ts, end_ts, duration_ms, filename, type) VALUES (?, ?, ?, ?, ?)",
                                    [ts, ts + dur, dur, `${dayStr}/${file}`, 'segment']);
                            }
                        });
                        db.run("COMMIT");
                        fs.renameSync(p, p + '.migrated');
                        log(camId, `Migrated ${f}`);
                    } catch (e) { log(camId, `Migr Error: ${e.message}`); }
                }
            });
        }
    });

    dbs.set(camId, db);
    return db;
}

const recorders = new Map();

function insertSegment(state, filename, ptsStart, ptsEnd) {
    const { camId, dayDir } = state;
    const durationMs = Math.round((ptsEnd - ptsStart) * 1000);

    if (state.epochOffset === null) {
        state.epochOffset = Date.now() - (ptsEnd * 1000);
        log(camId, `Sync: EpochOffset=${state.epochOffset}`);
    }

    const startTs = Math.round(state.epochOffset + (ptsStart * 1000));
    const endTs = startTs + durationMs;

    // Metrics: Drift Tracking
    const videoElapsed = ptsEnd * 1000;
    const wallElapsed = Date.now() - state.lastStart;
    state.stats.driftMs = Math.round(videoElapsed - wallElapsed);

    const db = getDB(camId);

    // Gap Detection
    if (state.lastEndTs !== null) {
        const gap = startTs - state.lastEndTs;
        if (gap > 2000) {
            state.stats.gapCount++;
            state.stats.lastGapTime = new Date().toISOString();
            log(camId, `⚠️ GAP: ${gap}ms`);
            db.run("INSERT OR IGNORE INTO segments (start_ts, end_ts, duration_ms, filename, type) VALUES (?, ?, ?, ?, ?)",
                [state.lastEndTs, startTs, gap, '', 'gap']);
        }
    }
    state.lastEndTs = endTs;

    const finalFilename = `${formatTime(startTs)}.m4s`;
    const oldPath = path.join(dayDir, filename);
    const newPath = path.join(dayDir, finalFilename);

    try {
        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
            db.run("INSERT OR REPLACE INTO segments (start_ts, end_ts, duration_ms, filename, type) VALUES (?, ?, ?, ?, ?)",
                [startTs, endTs, durationMs, `${state.dayStr}/${finalFilename}`, 'segment']);

            state.stats.segmentCount++;

            // Controlled Flush (Checkpoint WAL every 60 segments)
            if (state.stats.segmentCount % 60 === 0) {
                db.run("PRAGMA wal_checkpoint(PASSIVE)");
            }
        }
    } catch (e) { log(camId, "IO Error: " + e.message); }
}

function startRecorder(cam) {
    if (recorders.has(cam.id)) return;
    const camId = cam.id;
    const dayStr = new Date().toISOString().split('T')[0];
    const dayDir = path.join(STORAGE_ROOT, camId, dayStr);
    if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

    const csvPath = path.join(dayDir, 'index.csv');
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);

    log(camId, `Starting Enterprise V5.1 (Fixed) -> ${dayStr}`);

    const rtspUrl = `rtsp://127.0.0.1:8554/${camId}_hd`;
    const args = [
        '-y', '-nostdin', '-rtsp_transport', 'tcp',
        '-fflags', '+nobuffer', '-flags', 'low_delay',
        '-i', rtspUrl,
        '-c:v', 'copy', '-an',
        '-force_key_frames', `expr:gte(t,n_forced*${SEG_DURATION})`,
        '-f', 'segment', '-segment_format', 'mp4',
        '-segment_time', SEG_DURATION.toString(),
        '-segment_list', 'index.csv', '-segment_list_type', 'csv', '-segment_list_flags', '+live',
        '-reset_timestamps', '1', '-avoid_negative_ts', 'make_zero',
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        'seg_%06d.mp4'
    ];

    const child = spawn('ffmpeg', args, { cwd: dayDir });
    const state = {
        process: child, camId, dayStr, dayDir,
        epochOffset: null, lastEndTs: null, csvLastSize: 0,
        restarts: 0, lastStart: Date.now(),
        stats: {
            fps: 0,
            speed: '0x',
            segmentCount: 0,
            gapCount: 0,
            driftMs: 0,
            lastGapTime: null
        }
    };
    recorders.set(camId, state);

    state.csvTimer = setInterval(() => {
        if (!fs.existsSync(csvPath)) return;
        try {
            const stats = fs.statSync(csvPath);
            if (stats.size > state.csvLastSize) {
                const content = fs.readFileSync(csvPath, 'utf8');
                const newLines = content.substring(state.csvLastSize).split('\n').filter(l => l.trim().includes(','));
                state.csvLastSize = stats.size;

                newLines.forEach(line => {
                    const parts = line.split(',');
                    if (parts.length >= 3) insertSegment(state, parts[0].trim(), parseFloat(parts[1]), parseFloat(parts[2]));
                });
            }
        } catch (e) { log(camId, "CSV Poll Error: " + e.message); }
    }, 500);

    child.stderr.on('data', (d) => {
        const s = d.toString();
        const fpsMatch = s.match(/fps=\s*([\d.]+)/);
        if (fpsMatch) state.stats.fps = parseFloat(fpsMatch[1]);
        const speedMatch = s.match(/speed=\s*([\d.x]+)/);
        if (speedMatch) state.stats.speed = speedMatch[1];
        if (s.includes('fail') || s.includes('refused') || s.includes('404')) {
            if (Math.random() < 0.05) log(camId, "FFmpeg: " + s.substring(0, 50));
        }
    });

    child.on('close', (code) => {
        log(camId, `FFmpeg exited with code ${code}`);
        clearInterval(state.csvTimer);
        recorders.delete(camId);

        const uptime = Date.now() - state.lastStart;
        if (uptime < 10000) {
            state.restarts++;
            const delay = Math.min(30000, 2000 * Math.pow(2, state.restarts));
            log(camId, `Backoff restart in ${delay}ms`);
            setTimeout(() => syncProcesses(), delay);
        } else {
            state.restarts = 0;
            setTimeout(() => syncProcesses(), 1000);
        }
    });
}

function stopRecorder(camId) {
    const r = recorders.get(camId);
    if (r) {
        clearInterval(r.csvTimer);
        if (r.process) {
            r.process.removeAllListeners('close');
            r.process.kill('SIGTERM');
        }
        recorders.delete(camId);
    }
}

function syncProcesses() {
    try {
        const cams = readConfig();
        if (!cams || cams.length === 0) return;
        const enabled = new Set(cams.filter(c => c.enabled).map(c => c.id));
        const todayStr = new Date().toISOString().split('T')[0];

        cams.forEach(c => {
            if (c.enabled) {
                if (!recorders.has(c.id)) startRecorder(c);
                else {
                    const r = recorders.get(c.id);
                    if (r.dayStr !== todayStr) {
                        log(c.id, "Day rotation...");
                        stopRecorder(c.id);
                        setTimeout(() => syncProcesses(), 1000);
                    }
                }
            }
        });

        for (const [id] of recorders) { if (!enabled.has(id)) stopRecorder(id); }
    } catch (e) { log('System', "Sync Error: " + e.message); }
}

setInterval(syncProcesses, 10000);
syncProcesses();

http.createServer((req, res) => {
    const result = {
        systemDay: new Date().toISOString().split('T')[0],
        activeCount: recorders.size,
        recorders: Array.from(recorders.keys()).map(id => {
            const r = recorders.get(id);
            return {
                id: id,
                uptimeSec: Math.round((Date.now() - r.lastStart) / 1000),
                day: r.dayStr,
                ...r.stats
            };
        })
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result, null, 2));
}).listen(5003);
