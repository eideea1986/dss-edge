const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');
const { spawn } = require('child_process');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

/**
 * Enterprise Path Resolver
 * Handles flat structure, legacy hierarchical, and URL-encoded variants.
 */
function resolvePath(camId, segmentFile) {
    if (!segmentFile) return null;
    const camDir = path.join(STORAGE_ROOT, camId);
    if (!fs.existsSync(camDir)) return null;

    const decoded = decodeURIComponent(segmentFile);

    // Ordered Search Strategy
    const candidates = [
        path.join(camDir, decoded),                         // 1. Exact (Flat)
        path.join(camDir, decoded.replace(/_/g, '/')),      // 2. Legacy Hierarchical (YYYY/MM/DD)
        path.join(camDir, segmentFile),                     // 3. Literal Raw
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    return null;
}

/**
 * Optimized DB Connection Pool (Limited to this module)
 */
const dbConnections = new Map();
function getDB(camId) {
    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return null;

    // We keep it simple: open/close per request for safety in this distributed SQLite architecture
    return new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
}

/**
 * DATABASE AUTHORITATIVE LOOKUP
 */
async function getSegmentsDB(camId, startTime, endTime) {
    return new Promise((resolve) => {
        const db = getDB(camId);
        if (!db) return resolve([]);

        // Buffer range (+/- 2s) to ensure overlapping segments are caught
        const query = `SELECT file, start_ts, end_ts FROM segments 
                       WHERE end_ts > ? AND start_ts < ? 
                       ORDER BY start_ts ASC`;

        db.all(query, [startTime - 2000, endTime + 2000], (err, rows) => {
            db.close();
            if (err) {
                console.error(`[Playback] DB Query Fail [${camId}]:`, err.message);
                return resolve([]);
            }

            const results = rows.map(r => ({
                ...r,
                file_path: resolvePath(camId, r.file)
            })).filter(r => r.file_path);

            resolve(results);
        });
    });
}

/**
 * ENTERPRISE MSE STREAMER
 * Streams fMP4 segments with Range support for stability.
 */
const streamSegment = (req, res) => {
    const { camId, file } = req.params;
    const filePath = resolvePath(camId, file);

    if (!filePath) {
        console.warn(`[Playback] Path 404: ${camId}/${file}`);
        return res.sendStatus(404);
    }

    try {
        const stats = fs.statSync(filePath);
        const range = req.headers.range;

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache segments! They don't change.

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunksize = (end - start) + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
            });
            fileStream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': stats.size,
                'Accept-Ranges': 'bytes',
            });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (e) {
        console.error(`[Playback] Streaming error ${camId}/${file}:`, e.message);
        if (!res.headersSent) res.sendStatus(500);
    }
};

/**
 * Playlist (Segments) Provider
 */
const getPlaylist = async (req, res) => {
    const { camId } = req.params;
    const startTime = Number(req.query.start) || (Date.now() - 3600000);
    const endTime = Number(req.query.end) || (startTime + 3600000);

    try {
        const segments = await getSegmentsDB(camId, startTime, endTime);

        // Return structured data for MSE Player
        res.json({
            camId,
            range: { start: startTime, end: endTime },
            count: segments.length,
            segments: segments.map(s => ({
                url: `/api/playback/stream/${camId}/${encodeURIComponent(s.file.replace(/\//g, '_'))}`,
                start_ts: s.start_ts,
                end_ts: s.end_ts,
                duration: Math.round(s.end_ts - s.start_ts)
            }))
        });
    } catch (e) {
        console.error(`[Playback] Playlist Error [${camId}]:`, e.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Legacy HLS Fallback (Untrammeled)
const streamSegmentHLS = (req, res) => {
    const { camId, file } = req.params;
    const filePath = resolvePath(camId, file);
    if (!filePath) return res.sendStatus(404);

    res.writeHead(200, { 'Content-Type': 'video/MP2T', 'Access-Control-Allow-Origin': '*' });
    const ffmpeg = spawn('ffmpeg', ['-i', filePath, '-an', '-c:v', 'copy', '-f', 'mpegts', '-']);
    ffmpeg.stdout.pipe(res);
    req.on('close', () => ffmpeg.kill('SIGKILL'));
};

const getPlaylistM3U8 = async (req, res) => {
    const { camId } = req.params;
    const realCamId = camId.replace('.m3u8', '');
    const segments = await getSegmentsDB(realCamId, Number(req.query.start), Number(req.query.end));

    let m3u8 = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:12\n#EXT-X-PLAYLIST-TYPE:VOD\n";
    if (segments.length > 0) m3u8 += `#EXT-X-PROGRAM-DATE-TIME:${new Date(segments[0].start_ts).toISOString()}\n`;

    segments.forEach(s => {
        m3u8 += `#EXTINF:${((s.end_ts - s.start_ts) / 1000).toFixed(3)},\n`;
        m3u8 += `/api/playback/stream-hls/${realCamId}/${encodeURIComponent(s.file.replace(/\//g, '_'))}\n`;
    });

    m3u8 += "#EXT-X-ENDLIST\n";
    res.set('Content-Type', 'application/vnd.apple.mpegurl').send(m3u8);
};

module.exports = { getPlaylist, streamSegment, getPlaylistM3U8, streamSegmentHLS, getGlobalRecordingRange: (req, res) => res.json({ start: null, end: null }) };
