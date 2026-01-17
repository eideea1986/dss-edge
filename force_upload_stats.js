const { Client } = require('ssh2');

const config = {
    host: '192.168.120.208',
    port: 22,
    username: 'root',
    password: 'TeamS_2k25!'
};

const REMOTE_FILE = '/opt/dss-edge/local-api/playback/playbackStats.js';

const CONTENT = `const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3');

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

const getStats = (req, res) => {
    return res.json({ first: null, last: null });
};

const getTimelineDay = (req, res) => {
    const { camId, date } = req.params;
    console.log(\`[Timeline] Request for \${camId} on \${date}\`);

    try {
        const [y, m, d] = date.split('-');
        const dayDir = path.join(STORAGE_ROOT, camId, y, m, d);
        console.log(\`[Timeline] Scanning: \${dayDir}\`);
        
        if (fs.existsSync(dayDir)) {
            let segments = [];

            const processFile = (f, parentDate) => {
                try {
                    // Extract HH-MM-SS from filename
                    // Supports "HH-MM-SS.mp4" or "MM-SS.mp4" (if in hour folder)
                    let h, min, s;
                    
                    const parts = f.replace('.mp4','').split('-');
                    
                    if (parts.length === 3) {
                         // HH-MM-SS
                         h = parseInt(parts[0]);
                         min = parseInt(parts[1]);
                         s = parseInt(parts[2]);
                    } else if (parts.length === 2 && parentDate) {
                         // MM-SS (inside HH folder supposedly?)
                         // Typically NVR uses full name even in subdir.
                         // Let's handle 3 parts primarily.
                         return; // Skip if unknown format
                    } else {
                        return;
                    }

                    const segDate = new Date(parseInt(y), parseInt(m)-1, parseInt(d), h, min, s, 0);
                    const start = segDate.getTime();
                    
                    segments.push({
                        start_ts: start,
                        end_ts: start + 60000,
                        file: f // Note: This file path is relative to...? 
                                // Frontend uses this only for visualization usually?
                                // If Frontend clicks it -> it calls play.
                                // Play uses SegmentSelector.
                                // So 'file' here is just metadata. 
                                // We'll put simpler name.
                    });
                } catch(e) {}
            };

            // 1. Scan Root Day Files
            try {
                const rootFiles = fs.readdirSync(dayDir).filter(f => f.endsWith('.mp4'));
                console.log(\`[Timeline] Found \${rootFiles.length} files in root.\`);
                rootFiles.forEach(f => processFile(f, null));
            } catch(e) {}

            // 2. Scan Subfolders (00-23)
            for (let i=0; i<24; i++) {
                const hh = String(i).padStart(2,'0');
                const hDir = path.join(dayDir, hh);
                if (fs.existsSync(hDir) && fs.statSync(hDir).isDirectory()) {
                    try {
                        const hFiles = fs.readdirSync(hDir).filter(f => f.endsWith('.mp4'));
                        console.log(\`[Timeline] Found \${hFiles.length} files in \${hh}.\`);
                        hFiles.forEach(f => processFile(f, null)); // NVR usually writes full %H-%M-%S name
                    } catch(e) {}
                }
            }

            segments.sort((a,b) => a.start_ts - b.start_ts);
            
            console.log(\`[Timeline] Returning \${segments.length} segments.\`);

            return res.json({
                dayStart: new Date(parseInt(y), parseInt(m)-1, parseInt(d)).getTime(),
                segments
            });
        } else {
             console.log("[Timeline] Day dir not found");
        }
    } catch(e) {
        console.error("Timeline FS Error", e);
    }
    
    return res.json({ dayStart: 0, segments: [] });
};

module.exports = { getStats, getTimelineDay };
`;

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH Ready - Force Writing playbackStats.js');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        const stream = sftp.createWriteStream(REMOTE_FILE);
        stream.write(CONTENT);
        stream.end();
        stream.on('close', () => {
            console.log("Write Complete.");
            conn.end();
        });
    });
}).connect(config);
