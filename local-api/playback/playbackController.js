const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');
const { spawn } = require('child_process');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

function resolvePath(camId, segmentFile) {
    const decoded = decodeURIComponent(segmentFile).replace(/_/g, '/');
    const hierarchical = path.join(STORAGE_ROOT, camId, decoded);
    if (fs.existsSync(hierarchical)) return hierarchical;
    const relPath = path.join(STORAGE_ROOT, camId, segmentFile);
    if (fs.existsSync(relPath)) return relPath;
    return null;
}

/**
 * ENTERPRISE MSE STREAMER
 * Returns Fragmented MP4 (fMP4) compatible with SourceBuffer
 */
const streamSegment = (req, res) => {
    const { camId, file } = req.params;
    const filePath = resolvePath(camId, file);

    if (!filePath) return res.sendStatus(404);

    res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
    });

    // FFmpeg settings for MSE-ready fragmented MP4
    const ffmpegArgs = [
        '-i', filePath,
        '-an', // Disable audio for now to avoid sync issues in MSE
        '-c:v', 'copy',
        '-f', 'mp4',
        // CRITICAL: fragmented mp4 flags
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        '-reset_timestamps', '1',
        '-avoid_negative_ts', 'make_zero',
        '-'
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    ffmpeg.stdout.pipe(res);

    req.on('close', () => {
        ffmpeg.kill('SIGKILL');
    });
};

const getSegmentsDB = (camId, startTime, endTime) => {
    return new Promise((resolve) => {
        const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
        if (!fs.existsSync(dbPath)) return resolve([]);
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
        const query = `SELECT file, start_ts, end_ts FROM segments WHERE end_ts >= ? AND start_ts <= ? ORDER BY start_ts ASC`;
        db.all(query, [startTime, endTime], (err, rows) => {
            db.close();
            if (err) return resolve([]);
            resolve(rows.map(r => ({ ...r, file_path: resolvePath(camId, r.file) })).filter(r => r.file_path));
        });
    });
};

const getPlaylist = async (req, res) => {
    const { camId } = req.params;
    const startTime = Number(req.query.start) || Date.now() - 3600000;
    const endTime = Number(req.query.end) || startTime + 3600000;

    try {
        const segments = await getSegmentsDB(camId, startTime, endTime);
        res.json({
            camId,
            startTime,
            endTime,
            segments: segments.map(s => ({
                url: `/api/playback/stream/${camId}/${encodeURIComponent(s.file.replace(/\//g, '_'))}`,
                start_ts: s.start_ts,
                end_ts: s.end_ts,
                duration: (s.end_ts - s.start_ts) / 1000
            }))
        });
    } catch (e) {
        res.status(500).send(e.message);
    }
};

module.exports = { getPlaylist, streamSegment, getGlobalRecordingRange: (req, res) => res.json({ start: null, end: null }) };
