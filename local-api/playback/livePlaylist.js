const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

function resolvePath(camId, segmentFile) {
    const subPath = path.join(STORAGE_ROOT, camId, 'segments', segmentFile);
    if (fs.existsSync(subPath)) return subPath;
    const flatPath = path.join(STORAGE_ROOT, camId, segmentFile);
    if (fs.existsSync(flatPath)) return flatPath;
    return null;
}

const getLivePlaylist = (req, res) => {
    const { camId } = req.params;

    // Live window: last 60 seconds with 10 second delay for safety
    const DELAY_MS = 10000;  // 10 second delay (safe margin)
    const WINDOW_MS = 60000; // 60 second window

    const now = Date.now();
    const endTime = now - DELAY_MS;
    const startTime = endTime - WINDOW_MS;

    const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
    if (!fs.existsSync(dbPath)) return res.sendStatus(404);

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    // Fix: Select segments that OVERLAP the requested window
    // (end_ts > requested_start AND start_ts < requested_end)
    const sql = `SELECT * FROM segments WHERE end_ts > ? AND start_ts < ? ORDER BY start_ts ASC`;

    db.all(sql, [startTime, endTime], (err, rows) => {
        db.close();
        if (err || !rows) return res.status(500).send("DB Error");
        if (rows.length === 0) return res.status(200).send("#EXTM3U\n#EXT-X-VERSION:3\n");

        try {
            const SEG_DURATION = 2;

            let m3u8 = "#EXTM3U\n";
            m3u8 += "#EXT-X-VERSION:3\n";
            m3u8 += `#EXT-X-TARGETDURATION:${SEG_DURATION + 1}\n`;

            // CRITICAL: Global monotonic MEDIA-SEQUENCE for Live Sliding Window
            if (!rows[0] || !rows[0].start_ts) {
                console.error("[LivePlaylist] Invalid first row:", rows[0]);
                return res.status(500).send("Invalid DB Data");
            }

            const firstSegmentTime = rows[0].start_ts;
            const globalSequence = Math.floor(firstSegmentTime / (SEG_DURATION * 1000));
            m3u8 += `#EXT-X-MEDIA-SEQUENCE:${globalSequence}\n`;

            let validSegmentCount = 0;

            rows.forEach((row) => {
                if (!resolvePath(camId, row.file)) return;

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

            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(m3u8);

        } catch (e) {
            console.error("[LivePlaylist] Generation error:", e);
            res.status(500).send("Playlist Generation Error");
        }
    });
};

module.exports = { getLivePlaylist };
