const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');
const { spawn } = require('child_process');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

function resolvePath(camId, segmentFile) {
    // 1. Check Encoded "YYYY-MM-DD_HH-MM-SS.mp4" (New Standard)
    const regex = /^(\d{4})-(\d{2})-(\d{2})_(.*\.mp4)$/;
    const match = segmentFile.match(regex);
    if (match) {
        const [_, y, m, d, realName] = match;
        const p = path.join(STORAGE_ROOT, camId, y, m, d, realName);
        if (fs.existsSync(p)) return p;
    }

    // 2. Check YYYY-MM-DD/file.mp4 (Legacy Fallback)
    const relPath = path.join(STORAGE_ROOT, camId, segmentFile);
    if (fs.existsSync(relPath)) return relPath;

    // ... Legacy/Transition paths omitted for brevity but safe to keep
    return null;
}

const streamPartialSegment = (req, res, filePath) => {
    const offset = Number(req.query.offset || 0);
    const duration = Number(req.query.duration || 0);

    if (isNaN(offset) || isNaN(duration)) return res.sendStatus(400);

    res.writeHead(200, {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*'
    });

    const ffmpeg = spawn('ffmpeg', [
        '-ss', String(offset),
        '-analyzeduration', '0',
        '-probesize', '32',
        '-fflags', '+genpts+discardcorrupt+fastseek',
        '-i', filePath,
        '-t', String(duration),
        '-c', 'copy',
        '-output_ts_offset', String(offset),
        '-f', 'mpegts',
        '-'
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => { });

    req.on('close', () => {
        ffmpeg.kill();
    });
};

const streamSegment = (req, res) => {
    const { camId, file } = req.params;
    const filePath = resolvePath(camId, file);

    if (!filePath) {
        return res.sendStatus(404);
    }

    if (req.query.offset && req.query.duration) {
        return streamPartialSegment(req, res, filePath);
    }

    try {
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': 'video/mp2t',
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (e) {
        console.error(`[Stream] Error:`, e);
        if (!res.headersSent) res.sendStatus(500);
    }
};

const { selectSegments } = require('./SegmentSelector');

const getPlaylist = async (req, res) => {
    const { camId } = req.params;
    const isLive = req.query.mode === 'live';

    // Optimistic Live: 10 seconds ago
    const startTime = Number(req.query.start || (isLive ? Date.now() - 10000 : 0));
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const endTime = Number(req.query.end || (startTime + WINDOW_MS));

    const generateResponse = (rows) => {
        const SEG_DURATION = 2;
        let m3u8 = "#EXTM3U\n#EXT-X-VERSION:3\n";
        m3u8 += `#EXT-X-TARGETDURATION:${SEG_DURATION + 1}\n`;

        if (!isLive) m3u8 += "#EXT-X-PLAYLIST-TYPE:VOD\n";

        if (!rows || rows.length === 0) {
            m3u8 += "#EXT-X-MEDIA-SEQUENCE:0\n";
            if (!isLive) m3u8 += "#EXT-X-ENDLIST\n";
            return m3u8;
        }

        const firstSegmentTime = rows[0].start_ts;
        const globalSequence = Math.floor(firstSegmentTime / (SEG_DURATION * 1000));
        m3u8 += `#EXT-X-MEDIA-SEQUENCE:${globalSequence}\n`;

        let lastEndTs = null;
        rows.forEach((row) => {
            // Check existence (using absolute path from selector if avail)
            // resolvePath expects filename relative to storage structure.
            // Our selectSegments returns file_path (abs) and filename (base).
            // We'll trust file_path exists since we just scanned it.

            const fileDuration = (row.end_ts - row.start_ts) / 1000;
            let currentOffset = 0;
            let segmentBaseTime = row.start_ts;

            while (currentOffset < fileDuration - 0.05) {
                let chunkDur = SEG_DURATION;
                if (currentOffset + chunkDur > fileDuration) chunkDur = fileDuration - currentOffset;
                if (chunkDur < 0.1) break;

                const date = new Date(segmentBaseTime).toISOString();
                m3u8 += `#EXT-X-PROGRAM-DATE-TIME:${date}\n`;
                m3u8 += `#EXTINF:${chunkDur.toFixed(3)},\n`;
                // Use row.filename (HH-MM-SS.mp4)
                m3u8 += `/api/playback/stream/${camId}/${row.filename}?offset=${currentOffset.toFixed(3)}&duration=${chunkDur.toFixed(3)}\n`;

                currentOffset += chunkDur;
                segmentBaseTime += (chunkDur * 1000);
            }
        });

        if (!isLive) m3u8 += "#EXT-X-ENDLIST\n";
        return m3u8;
    };

    try {
        const segments = await selectSegments(camId, startTime, endTime - startTime);

        // Map to format expected by generator (with 'filename' property)
        // selectSegments from Step 1333 returns { file_path, start_ts, end_ts, filename }

        res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(generateResponse(segments));

    } catch (e) {
        console.error("Playlist Gen Error:", e);
        res.status(500).send("Gen Error");
    }
};

const streamMJPEG = (req, res) => {
    const { camId } = req.params;
    const start = Number(req.query.start);
    if (!start) return res.sendStatus(400);

    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return res.sendStatus(404);

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    // Get subsequent segments for next 60 seconds (buffer)
    const end = start + 60000;

    db.all("SELECT * FROM segments WHERE end_ts > ? AND start_ts < ? ORDER BY start_ts ASC LIMIT 30", [start, end], (err, rows) => {
        db.close();
        if (err || !rows || rows.length === 0) return res.sendStatus(404);

        // Generate Concat List
        const listPath = path.join(STORAGE_ROOT, camId, `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.txt`);
        let listContent = "";
        const firstSegmentStart = rows[0].start_ts;

        // Calculate seek offset within first segment
        let seekOffset = 0;
        if (start > firstSegmentStart) {
            seekOffset = (start - firstSegmentStart) / 1000;
        }

        rows.forEach(r => {
            const p = resolvePath(camId, r.file);
            if (p) listContent += `file '${p.replace(/\\/g, '/')}'\n`;
        });

        fs.writeFileSync(listPath, listContent);

        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
            'Connection': 'close',
            'Access-Control-Allow-Origin': '*'
        });

        // FFmpeg Concat & Transcode to MJPEG
        const args = [
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-ss', String(seekOffset),
            '-f', 'mpjpeg',
            '-boundary_tag', 'myboundary',
            '-'
        ];

        const ffmpeg = spawn('ffmpeg', args);

        ffmpeg.stdout.pipe(res);
        ffmpeg.stderr.on('data', () => { }); // Silence stderr

        const cleanup = () => {
            if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
            ffmpeg.kill();
        };

        res.on('close', cleanup);
        ffmpeg.on('exit', () => { if (fs.existsSync(listPath)) fs.unlinkSync(listPath); });
    });
};

const playbackStats = require('./playbackStats');

const getGlobalRecordingRange = (req, res) => {
    try {
        const { camId } = req.params;
        const range = playbackStats.getGlobalRange(camId);
        res.json(range);
    } catch (e) {
        console.error(e);
        res.status(500).json({ start: null, end: null, error: e.message });
    }
};

module.exports = { getPlaylist, streamSegment, streamMJPEG, getGlobalRecordingRange };
