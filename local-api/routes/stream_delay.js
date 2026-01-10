const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// Paths
const RECORDER_ROOT = path.resolve(__dirname, "../../recorder");
const SEGMENT_DIR = path.join(RECORDER_ROOT, "segments");

// NEW INDEPENDENT ROUTE FOR DELAYED STREAMING
// Serves M3U8 playlists based on recent MP4 files

router.get("/playlist/:uuid/:mode/:date/index.m3u8", (req, res) => {
    try {
        const { uuid, mode, date } = req.params;
        const baseDir = path.join(SEGMENT_DIR, uuid, mode);

        if (!fs.existsSync(baseDir)) return res.status(404).send("Storage not found");

        let searchDir = baseDir;
        // The segments are served statically by Express at /recorder/live
        let urlPrefix = `/recorder/live/${uuid}/${mode}`;

        // Check for Hierarchical Date Folder (created by recorder_ultra_light)
        const dateSubDir = path.join(baseDir, date);
        if (fs.existsSync(dateSubDir)) {
            searchDir = dateSubDir;
            urlPrefix = `/recorder/live/${uuid}/${mode}/${date}`;
        }

        if (!fs.existsSync(searchDir)) return res.status(404).send("No recordings dir");

        const allFiles = fs.readdirSync(searchDir);
        let segments = [];

        // Filter logic relies on file naming or folder presence
        if (searchDir === dateSubDir) {
            segments = allFiles.filter(f => f.endsWith(".mp4")).sort();
        } else {
            // Flat structure fallback
            segments = allFiles.filter(f => f.startsWith(date) && f.endsWith(".mp4")).sort();
        }

        // LIVE WINDOW STRATEGY:
        // User requested "3 sec delay". 
        // We serve the TAIL of the list.
        // 6 segments * 10s = 60s buffer. 
        // 3 sec delay is achieved by the player buffering the end.
        const activeSegments = segments.slice(-6);

        if (activeSegments.length === 0) return res.status(404).send("No segments for today");

        let m3u8 = "#EXTM3U\n";
        m3u8 += "#EXT-X-VERSION:3\n";
        m3u8 += "#EXT-X-TARGETDURATION:12\n";
        m3u8 += "#EXT-X-MEDIA-SEQUENCE:" + (Math.max(0, segments.length - activeSegments.length)) + "\n";

        activeSegments.forEach(seg => {
            m3u8 += "#EXTINF:10.0,\n";
            // Absolute Path to the STATIC file server
            m3u8 += `${urlPrefix}/${seg}\n`;
        });

        res.set("Content-Type", "application/vnd.apple.mpegurl");
        res.set("Cache-Control", "no-cache");
        res.send(m3u8);

    } catch (e) {
        console.error("[StreamDelay] Error:", e.message);
        res.status(500).send("Error generating playlist");
    }
});

module.exports = router;
