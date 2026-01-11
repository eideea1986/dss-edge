const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');
const { spawn } = require('child_process');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

function resolvePath(camId, segmentFile) {
    const subPath = path.join(STORAGE_ROOT, camId, 'segments', segmentFile);
    if (fs.existsSync(subPath)) return subPath;
    const flatPath = path.join(STORAGE_ROOT, camId, segmentFile);
    if (fs.existsSync(flatPath)) return flatPath;
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
        '-ss', String(offset),       // Seek input
        '-i', filePath,
        '-t', String(duration),      // Duration
        '-c', 'copy',                // Copy codec
        // CRITICAL: Offset output timestamps to match position in file.
        // This creates a continuous timeline for HLS player within the file.
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

const getPlaylist = (req, res) => {
    const { camId } = req.params;
    const startTime = Number(req.query.start || 0);
    const LIMIT_MS = 6 * 60 * 60 * 1000;
    const endTime = Number(req.query.end || (startTime + LIMIT_MS));

    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return res.sendStatus(404);

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    const sql = `SELECT * FROM segments WHERE start_ts >= ? AND start_ts < ? ORDER BY start_ts ASC`;

    db.all(sql, [startTime, endTime], (err, rows) => {
        db.close();
        if (err || !rows) return res.status(500).send("DB Error");
        if (rows.length === 0) return res.status(200).send("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST");

        const SEG_DURATION = 2;

        let m3u8 = "#EXTM3U\n";
        m3u8 += "#EXT-X-VERSION:3\n";
        m3u8 += `#EXT-X-TARGETDURATION:${SEG_DURATION + 1}\n`;
        m3u8 += "#EXT-X-PLAYLIST-TYPE:VOD\n";
        m3u8 += "#EXT-X-MEDIA-SEQUENCE:0\n";

        let validSegmentCount = 0;

        rows.forEach((row) => {
            if (!resolvePath(camId, row.file)) return;

            // DISCONTINUITY only at physical file boundary (New PTS Origin)
            if (validSegmentCount > 0) m3u8 += "#EXT-X-DISCONTINUITY\n";

            const fileDuration = (row.end_ts - row.start_ts) / 1000;
            let currentOffset = 0;
            let segmentBaseTime = row.start_ts;

            while (currentOffset < fileDuration) {
                let chunkDur = SEG_DURATION;
                if (currentOffset + chunkDur > fileDuration) {
                    chunkDur = fileDuration - currentOffset;
                }

                if (chunkDur < 0.1) break;

                const date = new Date(segmentBaseTime).toISOString();
                m3u8 += `#EXT-X-PROGRAM-DATE-TIME:${date}\n`;
                m3u8 += `#EXTINF:${chunkDur.toFixed(3)},\n`;
                m3u8 += `/api/playback/stream/${camId}/${row.file}?offset=${currentOffset.toFixed(3)}&duration=${chunkDur.toFixed(3)}\n`;

                currentOffset += chunkDur;
                segmentBaseTime += (chunkDur * 1000);
            }

            validSegmentCount++;
        });

        m3u8 += "#EXT-X-ENDLIST\n";

        res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(m3u8);
    });
};

module.exports = { getPlaylist, streamSegment };
