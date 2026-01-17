import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import os from "os";

const CONFIG = {
    storageRoot: "/opt/dss-edge/storage",
    logFile: "/var/log/nvr-monitor.log",
    thresholds: { diskCleanup: 85, diskCritical: 95, cpuCritical: 4.0 },
    cleanupBatch: 50
};

function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}\n`;
    try { fs.appendFileSync(CONFIG.logFile, line); } catch (e) { console.log(line.trim()); }
}

function getDiskUsage() {
    try {
        const out = execSync(`df -P ${CONFIG.storageRoot}`).toString();
        const line = out.split("\n")[1];
        if (!line) return 0;
        const parts = line.split(/\s+/);
        return parseInt(parts[4].replace("%", "")) || 0;
    } catch (e) {
        log("Error getting disk usage: " + e.message);
        return 0;
    }
}

function cleanup() {
    log("Starting Cleanup Routine...");
    let cams = [];
    try {
        cams = fs.readdirSync(CONFIG.storageRoot).filter(c => c.startsWith("cam_"));
    } catch (e) { log("No cams found: " + e.message); return; }

    let segmentsDeleted = 0;

    for (const cam of cams) {
        const dbPath = path.join(CONFIG.storageRoot, cam, "index.db");
        if (!fs.existsSync(dbPath)) continue;

        try {
            // Get oldest segments
            // Table: segments(id, file, start_ts, end_ts)
            const cmdList = `sqlite3 ${dbPath} "SELECT file FROM segments ORDER BY start_ts ASC LIMIT ${CONFIG.cleanupBatch};"`;
            const files = execSync(cmdList).toString().trim().split("\n").filter(f => f);

            if (files.length === 0) continue; // Nothing to delete in this cam

            const filesToDelete = [];

            // Delete physical files
            for (const file of files) {
                // file is 'seg_xxx.ts'
                // path is storage/cam/segments/file
                const fullPath = path.join(CONFIG.storageRoot, cam, "segments", file);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    segmentsDeleted++;
                }
                filesToDelete.push(`'${file}'`);
            }

            // Delete from DB
            if (filesToDelete.length > 0) {
                const list = filesToDelete.join(",");
                const cmdDel = `sqlite3 ${dbPath} "DELETE FROM segments WHERE file IN (${list}); VACUUM;"`;
                execSync(cmdDel);
            }

        } catch (e) {
            log(`Error cleaning cam ${cam}: ${e.message}`);
        }
    }

    log(`Cleanup finished. Deleted ${segmentsDeleted} segments.`);
}

function loop() {
    try {
        const disk = getDiskUsage();
        if (disk >= CONFIG.thresholds.diskCleanup) {
            log(`Disk Usage ${disk}% >= ${CONFIG.thresholds.diskCleanup}%. Running Cleanup...`);
            cleanup();
        }

    } catch (e) {
        log("Loop Error: " + e.message);
    }
}

setInterval(loop, 10000); // 10 seconds check
log("NVR Monitor Service Started (v1.0)");
loop(); // Run immediately on start
