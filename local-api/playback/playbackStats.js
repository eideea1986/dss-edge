const path = require("path");
const fs = require("fs");

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

const getStats = (req, res) => {
    return res.json({ first: null, last: null });
};

const getTimelineDay = (req, res) => {
    const { camId, date } = req.params;
    // console.log(`[Timeline] Request for ${camId} on ${date}`);

    try {
        const [y, m, d] = date.split('-');
        const dayDir = path.join(STORAGE_ROOT, camId, y, m, d);

        const dayStartTs = new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
        let segments = [];

        if (fs.existsSync(dayDir)) {

            // Helper to process files
            const processFile = (f, fullPath, hourContext = null) => {
                try {
                    const name = f.replace('.mp4', '');
                    let h, min, s;

                    if (hourContext !== null) {
                        // Pattern B: MM-SS (Hierarchical, inside HH folder)
                        const parts = name.split('-');
                        if (parts.length >= 2) {
                            h = hourContext;
                            min = parseInt(parts[0]);
                            s = parseInt(parts[1]);
                        } else return;
                    } else {
                        // Pattern A: HH-MM-SS (Flat, in day root)
                        const parts = name.split('-');
                        if (parts.length >= 3) {
                            h = parseInt(parts[0]);
                            min = parseInt(parts[1]);
                            s = parseInt(parts[2]);
                        } else return;
                    }

                    if (isNaN(h) || isNaN(min) || isNaN(s)) return;

                    const startOffset = (h * 3600 + min * 60 + s) * 1000;
                    const startTs = dayStartTs + startOffset;

                    const stat = fs.statSync(fullPath);
                    // Approx duration: size / 1Mbps (125000 bytes/sec)
                    const durationSec = Math.max(1, stat.size / 125000);
                    const endTs = startTs + (durationSec * 1000);

                    segments.push({
                        start_ts: startTs,
                        end_ts: endTs,
                        file: path.relative(path.join(STORAGE_ROOT, camId), fullPath).replace(/\\/g, '/')
                    });
                } catch (e) { }
            };

            // 1. Scan Root Day Files (Flat structure)
            try {
                const rootFiles = fs.readdirSync(dayDir).filter(f => f.endsWith('.mp4'));
                rootFiles.forEach(f => processFile(f, path.join(dayDir, f), null));
            } catch (e) { }

            // 2. Scan Subdirectories (Hourly structure)
            try {
                const subDirs = fs.readdirSync(dayDir).filter(d => {
                    // Check if directory and numeric
                    try { return !d.includes('.') && !isNaN(parseInt(d)) && fs.statSync(path.join(dayDir, d)).isDirectory(); } catch (e) { return false; }
                });

                subDirs.forEach(hDir => {
                    const h = parseInt(hDir);
                    const hPath = path.join(dayDir, hDir);
                    const files = fs.readdirSync(hPath).filter(f => f.endsWith('.mp4'));
                    files.forEach(f => processFile(f, path.join(hPath, f), h));
                });
            } catch (e) { }
        }

        segments.sort((a, b) => a.start_ts - b.start_ts);

        // --- PLAYBACK STATE DETECTION (EXEC-23) ---
        const indexReady = fs.existsSync("/run/dss/index.ready");
        let playbackState = "OK";
        let stateReason = "";

        // Rule 1: Index rebuilding
        if (!indexReady) {
            playbackState = "INDEX_REBUILDING";
            stateReason = "Indexul este în reconstruire. Datele vor apărea automat.";
        }
        // Rule 2: No segments found
        else if (segments.length === 0) {
            // Check if ANY recordings exist for this camera (outside this day)
            const camDir = path.join(STORAGE_ROOT, camId);
            const hasAnyRecordings = fs.existsSync(camDir) &&
                fs.readdirSync(camDir).some(item => {
                    try {
                        const stat = fs.statSync(path.join(camDir, item));
                        return stat.isDirectory() && !item.startsWith('.');
                    } catch (e) { return false; }
                });

            if (hasAnyRecordings) {
                playbackState = "TIME_MISMATCH";
                stateReason = "Intervalul selectat nu conține date. Încercați să selectați o altă dată.";
            } else {
                playbackState = "NO_DATA";
                stateReason = "Nu există înregistrări pentru această cameră.";
            }
        }

        return res.json({
            dayStart: dayStartTs,
            segments,
            playback_state: playbackState,
            state_reason: stateReason
        });

    } catch (e) {
        console.error("Timeline FS Error", e);
        return res.status(500).json({
            dayStart: 0,
            segments: [],
            playback_state: "ERROR",
            state_reason: "Eroare de sistem la citirea datelor."
        });
    }
};

// --- FAST RANGE LOOKUP (No Full Scan) ---
const getGlobalRange = (camId) => {
    const camDir = path.join(STORAGE_ROOT, camId);
    if (!fs.existsSync(camDir)) return { start: null, end: null };

    const getEdgePath = (dir, mode) => {
        try {
            if (!fs.existsSync(dir)) return null;
            const items = fs.readdirSync(dir).filter(x => !x.startsWith('.'));
            if (items.length === 0) return null;

            // Sort numeric
            items.sort((a, b) => {
                return mode === 'min' ? a.localeCompare(b, undefined, { numeric: true }) : b.localeCompare(a, undefined, { numeric: true });
            });

            const top = items[0];
            const nextPath = path.join(dir, top);
            const stat = fs.statSync(nextPath);

            if (stat.isDirectory()) {
                return getEdgePath(nextPath, mode);
            } else if (top.endsWith('.mp4')) {
                return nextPath;
            }
            return null;
        } catch (e) { return null; }
    };

    const minFile = getEdgePath(camDir, 'min');
    const maxFile = getEdgePath(camDir, 'max');

    const extractTs = (fullPath) => {
        if (!fullPath) return null;
        try {
            const rel = path.relative(path.join(STORAGE_ROOT, camId), fullPath).replace(/\\/g, '/');
            const parts = rel.split('/');
            // Expect: YYYY/MM/DD/[HH/MM-SS | HH-MM-SS]
            if (parts.length >= 3) {
                const y = parseInt(parts[0]);
                const m = parseInt(parts[1]) - 1;
                const d = parseInt(parts[2]);

                let h = 0, min = 0, s = 0;
                const last = parts[parts.length - 1];
                const sub = parts[parts.length - 2];

                if (!isNaN(parseInt(sub)) && parts.length === 5) {
                    // Pattern HH/MM-SS.mp4
                    h = parseInt(sub);
                    const p = last.replace('.mp4', '').split('-');
                    min = parseInt(p[0]);
                    s = parseInt(p[1]);
                } else {
                    // Pattern HH-MM-SS.mp4
                    const p = last.replace('.mp4', '').split('-');
                    if (p.length === 3) {
                        h = parseInt(p[0]);
                        min = parseInt(p[1]);
                        s = parseInt(p[2]);
                    }
                }
                return new Date(y, m, d, h, min, s).getTime();
            }
        } catch (e) { }
        return fs.statSync(fullPath).mtimeMs;
    };

    return {
        start: extractTs(minFile),
        end: extractTs(maxFile)
    };
};

module.exports = { getStats, getTimelineDay, getGlobalRange };
