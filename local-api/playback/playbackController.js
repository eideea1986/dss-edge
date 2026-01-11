const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

/**
 * PLAYBACK STABIL - IMPLEMENTARE REFERENCE
 * Primeste: camId, ts (epoch ms)
 * Returneaza: Stream Video MP4 Fragmentat (libx264)
 */
const startPlayback = (req, res) => {
    const camId = req.params.camId || req.query.camId || req.body.camId;
    const tsStr = req.query.ts || req.query.start || req.body.ts || req.body.from;

    if (!camId || !tsStr) {
        return res.status(400).send("Missing camId or ts");
    }

    const seekTs = Number(tsStr);
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return res.status(404).send("Camera DB not found");

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    // 1. Find START segment
    const sql = `SELECT * FROM segments 
                 WHERE start_ts <= ? 
                 AND (end_ts > ? OR end_ts = 0)
                 ORDER BY start_ts DESC LIMIT 1`;

    db.get(sql, [seekTs, seekTs], (err, startSeg) => {
        if (err || !startSeg) {
            // Fallback: Find NEXT available if in a hole
            const nextSql = `SELECT * FROM segments WHERE start_ts > ? ORDER BY start_ts ASC LIMIT 1`;
            db.get(nextSql, [seekTs], (err2, nextSeg) => {
                if (nextSeg) {
                    fetchSequence(db, camId, nextSeg, 0, res, nextSeg.start_ts);
                } else {
                    db.close();
                    res.status(404).send("No footage found");
                }
            });
            return;
        }

        // 2. Fetch Sequence (Next segments to ensure continuous play)
        // We fetch up to 200 segments (approx 10-15 mins if segments are short)
        fetchSequence(db, camId, startSeg, seekTs, res);
    });
};

function fetchSequence(db, camId, startSeg, seekTs, res) {
    const listSql = `SELECT * FROM segments 
                     WHERE start_ts >= ? 
                     ORDER BY start_ts ASC LIMIT 200`;

    db.all(listSql, [startSeg.start_ts], (err, segments) => {
        db.close();
        if (err || !segments || segments.length === 0) {
            return res.status(500).send("Sequence error");
        }

        // Calculate offset in the FIRST segment
        const offsetSec = Math.max(0, (seekTs - startSeg.start_ts) / 1000);

        streamSequence(res, camId, segments, offsetSec);
    });
}

function resolvePath(camId, segmentFile) {
    let filePath = segmentFile;
    if (!path.isAbsolute(filePath)) filePath = path.join(STORAGE_ROOT, camId, segmentFile);
    if (fs.existsSync(filePath)) return filePath;

    // Try 'segments' subfolder
    const subPath = path.join(STORAGE_ROOT, camId, 'segments', segmentFile);
    if (fs.existsSync(subPath)) return subPath;

    return null;
}

function streamSequence(res, camId, segments, offsetSec) {
    // Filter segments that actually exist on disk
    const validSegments = segments.map(s => resolvePath(camId, s.file)).filter(p => p !== null);

    if (validSegments.length === 0) {
        return res.status(404).send("No files found on disk");
    }

    const tmpDir = '/tmp/playback';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const listPath = path.join(tmpDir, `list_${camId}_${Date.now()}.txt`);
    const concatList = validSegments.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listPath, concatList);

    console.log(`[Playback] Concat Stream ${camId} | Segments: ${validSegments.length} | Start Offset: ${offsetSec.toFixed(2)}s`);

    // HEADERS
    res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache, no-store',
    });

    // FFMPEG with Concat Demuxer
    const args = [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'concat', '-safe', '0',
        '-ss', offsetSec.toFixed(3),
        '-i', listPath,

        // TRANSCODE OBLIGATORIU for browser stability
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',
        '-pix_fmt', 'yuv420p',
        '-g', '30',
        '-c:a', 'aac', '-ac', '2', '-ar', '44100',

        // FRAGMENTED MP4
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
    ];

    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.stdout.pipe(res);

    let bytesSent = 0;
    ffmpeg.stdout.on('data', c => { bytesSent += c.length; });
    ffmpeg.stderr.on('data', d => console.error(`[FFMPEG PB ERR] ${d}`));

    ffmpeg.on('exit', (code) => {
        if (code !== 0 && code !== null) console.error(`[Playback] FFmpeg exited with code ${code}`);
        try { if (fs.existsSync(listPath)) fs.unlinkSync(listPath); } catch (e) { }
    });

    res.on('close', () => {
        const mb = (bytesSent / 1024 / 1024).toFixed(2);
        console.log(`[Playback] Connection closed for ${camId}. Sent ${mb} MB.`);
        try {
            ffmpeg.stdout.unpipe(res);
            ffmpeg.kill('SIGTERM');
        } catch (e) { }
        setTimeout(() => {
            try { if (fs.existsSync(listPath)) fs.unlinkSync(listPath); } catch (e) { }
        }, 1000);
    });
}



const stopPlayback = (req, res) => {
    res.json({ status: "ok" });
};

module.exports = { startPlayback, stopPlayback, play: startPlayback, stop: stopPlayback };

