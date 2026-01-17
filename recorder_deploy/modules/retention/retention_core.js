const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Redis = require('ioredis');

// --- CONFIG ---
const STORAGE_ROOT = "/opt/dss-edge/storage";
const MAX_USAGE_PERCENT = 90;   // Trigger cleanup at 90%
const TARGET_USAGE_PERCENT = 85; // Stop cleanup at 85%
const CHECK_INTERVAL = 30000;   // Check every 30s
const FILES_PER_BATCH = 50;     // Delete 50 files/dirs at a time

const redis = new Redis();

// --- HELPERS ---

function getDiskUsage() {
    return new Promise((resolve, reject) => {
        exec(`df -P ${STORAGE_ROOT} | tail -1 | awk '{print $5}'`, (err, stdout) => {
            if (err) return resolve(100); // Assume full on error to be safe? Or 0? 100 triggers safety cleanup.
            const percent = parseInt(stdout.replace('%', '').trim());
            resolve(isNaN(percent) ? 0 : percent);
        });
    });
}

function getDirectories(srcPath) {
    try {
        return fs.readdirSync(srcPath).filter(file => {
            return fs.statSync(path.join(srcPath, file)).isDirectory();
        });
    } catch (e) { return []; }
}

// Enterprise Strategy: Find the oldest "Day" folder across all cameras
// Path Structure: /storage/CAM_ID/YYYY/MM/DD/HH/...
function findOldestDayFolder() {
    const cameras = getDirectories(STORAGE_ROOT);
    let oldestDate = new Date();
    let oldestPath = null;

    cameras.forEach(cam => {
        const camPath = path.join(STORAGE_ROOT, cam);
        const years = getDirectories(camPath).sort(); // 2024, 2025...

        if (years.length > 0) {
            const year = years[0];
            const yearPath = path.join(camPath, year);
            const months = getDirectories(yearPath).sort();

            if (months.length > 0) {
                const month = months[0];
                const monthPath = path.join(yearPath, month);
                const days = getDirectories(monthPath).sort();

                if (days.length > 0) {
                    const day = days[0];
                    const dayPath = path.join(monthPath, day);

                    // Construct Date Object to compare
                    const currentDirDate = new Date(`${year}-${month}-${day}`);
                    if (currentDirDate < oldestDate) {
                        oldestDate = currentDirDate;
                        oldestPath = dayPath;
                    }
                }
            }
        }
    });

    return oldestPath;
}

async function retentionCycle() {
    try {
        const usage = await getDiskUsage();
        console.log(`[RETENTION] Disk Usage: ${usage}% (Limit: ${MAX_USAGE_PERCENT}%)`);

        // Push telemetry
        redis.publish("system:usage", JSON.stringify({ disk: usage, timestamp: Date.now() }));
        redis.set("hb:retention", Date.now());

        if (usage >= MAX_USAGE_PERCENT) {
            console.warn(`[RETENTION] CRITICAL: Disk usage ${usage}% > ${MAX_USAGE_PERCENT}%. Starting Purge...`);

            // Loop until we reach safe levels
            let safe = false;
            while (!safe) {
                const target = findOldestDayFolder();
                if (!target) {
                    console.error("[RETENTION] Disk full but no deletable folders found!");
                    break;
                }

                console.log(`[RETENTION] DELETING OLD DAY: ${target}`);
                fs.rmSync(target, { recursive: true, force: true });

                // Check usage again
                const newUsage = await getDiskUsage();
                console.log(`[RETENTION] New Usage: ${newUsage}%`);

                if (newUsage <= TARGET_USAGE_PERCENT) safe = true;

                // Safety break to yield event loop
                await new Promise(r => setTimeout(r, 100));
            }
            console.log("[RETENTION] Purge Complete.");
        }
    } catch (e) {
        console.error("[RETENTION] Error in cycle:", e);
    }
}

// --- INIT ---
console.log("[RETENTION-CORE] Service Started.");
setInterval(retentionCycle, CHECK_INTERVAL);
retentionCycle(); // Run immediately

// Graceful Shutdown
process.on('SIGTERM', () => process.exit(0));
