const sqlite3 = require('/opt/dss-edge/local-api/node_modules/sqlite3');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Args: camId, startTs (ms)
const camId = process.argv[2];
const targetTs = parseInt(process.argv[3]);
const STORAGE_ROOT = '/opt/dss-edge/recorder/storage';

const log = (msg) => process.stderr.write(`[Engine ${camId}] ${msg}\n`);

if (!camId || !targetTs) {
    log("Error: Missing args");
    process.exit(1);
}

const dbPath = path.join(STORAGE_ROOT, camId, 'index.db');
if (!fs.existsSync(dbPath)) {
    log("Error: DB not found");
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

const queryAnchor = `
    SELECT filename, start_ts, end_ts 
    FROM segments 
    WHERE type='segment' AND start_ts <= ? 
    ORDER BY start_ts DESC 
    LIMIT 1
`;

db.get(queryAnchor, [targetTs], (err, anchorSeg) => {
    if (err) {
        log(`DB Error: ${err.message}`);
        process.exit(1);
    }

    let startSegment = null;
    let seekSeconds = 0;

    if (anchorSeg && targetTs <= anchorSeg.end_ts) {
        startSegment = anchorSeg;
        seekSeconds = (targetTs - anchorSeg.start_ts) / 1000;
        log(`Found containing segment: ${anchorSeg.filename}, Offset: ${seekSeconds}s`);
    } else {
        log(`Target in gap or valid segment not found. Searching for next...`);
    }

    const queryList = `
        SELECT filename, start_ts, end_ts
        FROM segments 
        WHERE type='segment' AND start_ts >= ? 
        ORDER BY start_ts ASC 
        LIMIT 100
    `;

    db.all(queryList, [startSegment ? startSegment.start_ts : targetTs], (err, rows) => {
        if (err || !rows || rows.length === 0) {
            log("No segments found for playback.");
            process.exit(1);
        }

        const concatFilePath = `/tmp/concat_${camId}_${Math.floor(Math.random() * 10000)}.txt`;
        const writeStream = fs.createWriteStream(concatFilePath);

        rows.forEach(row => {
            const fullPath = path.join(STORAGE_ROOT, camId, row.filename);
            writeStream.write(`file '${fullPath}'\n`);
        });
        writeStream.end();

        writeStream.on('finish', () => {
            // OPTION A: FORCED TRANSCODING
            // Stabilizes the stream by normalizing m4s fragments into a clean h264 stream

            const ffmpegArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', concatFilePath,
                '-ss', seekSeconds.toFixed(3), // Output seeking handled by re-encoding

                // --- TRANSCODING PARAMS ---
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-pix_fmt', 'yuv420p',
                '-g', '50', // Ensure frequent keyframes for WebRTC start
                // --------------------------

                '-f', 'mpegts',
                'pipe:1'
            ];

            log(`Spawning FFmpeg (Transcoding): ${ffmpegArgs.join(' ')}`);

            const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            ffmpeg.stdout.pipe(process.stdout);
            ffmpeg.stderr.on('data', (d) => log(`[FFMPEG] ${d.toString()}`));

            ffmpeg.on('close', (code) => {
                log(`Exited with code ${code}`);
                try { fs.unlinkSync(concatFilePath); } catch (e) { }
            });
        });
    });
});
