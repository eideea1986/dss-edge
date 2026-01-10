const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class RetentionManager {
    constructor() {
        this.storageRoot = '/opt/dss-edge/recorder/segments';
        this.minFreePercent = 10; // Keep at least 10% free
        this.targetFreePercent = 15; // Clean up until 15% free
    }

    async getDiskUsage() {
        return new Promise((resolve) => {
            exec("df -h " + this.storageRoot, (err, stdout) => {
                if (err) return resolve(null);
                const lines = stdout.split("\n");
                if (lines.length < 2) return resolve(null);
                const parts = lines[1].trim().split(/\s+/);
                // Filesystem Size Used Avail Use% Mounted
                const usedPercent = parseInt(parts[4].replace("%", ""));
                resolve(usedPercent);
            });
        });
    }

    async startCleanupLoop() {
        console.log("[Retention] Starting monitoring loop...");
        setInterval(async () => {
            try {
                const used = await this.getDiskUsage();
                console.log(`[Retention] Disk usage: ${used}%`);
                if (used > (100 - this.minFreePercent)) {
                    console.warn(`[Retention] Disk usage high (${used}%). Starting purge...`);
                    await this.purgeOldestSegments();
                }
            } catch (e) {
                console.error("[Retention] Loop error:", e);
            }
        }, 5 * 60 * 1000); // Check every 5 mins
    }

    async purgeOldestSegments() {
        // Strategy: Find all day folders and delete the oldest one
        // Structure: /segments/UUID/main/YYYY-MM-DD/
        const uuids = fs.readdirSync(this.storageRoot);
        let allDays = [];

        uuids.forEach(uuid => {
            const mainPath = path.join(this.storageRoot, uuid, 'main');
            if (fs.existsSync(mainPath)) {
                const days = fs.readdirSync(mainPath).filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/));
                days.forEach(d => allDays.push({ uuid, day: d, path: path.join(mainPath, d) }));
            }
            const subPath = path.join(this.storageRoot, uuid, 'sub');
            if (fs.existsSync(subPath)) {
                const days = fs.readdirSync(subPath).filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/));
                days.forEach(d => allDays.push({ uuid, day: d, path: path.join(subPath, d) }));
            }
        });

        if (allDays.length === 0) return;

        // Sort by day string
        allDays.sort((a, b) => a.day.localeCompare(b.day));

        // Delete the oldest day group
        const oldestDate = allDays[0].day;
        const today = new Date().toISOString().split('T')[0];

        if (oldestDate === today) {
            console.warn("[Retention] Only today's recordings exist. Deleting oldest hourly files...");
            // If only today exists, we need to be more granular.
            // For now, let's just delete the folders found for that day to free up space immediately.
        }

        const toDelete = allDays.filter(d => d.day === oldestDate);
        console.log(`[Retention] Purging ${toDelete.length} folders for date ${oldestDate}`);

        toDelete.forEach(item => {
            try {
                fs.rmSync(item.path, { recursive: true, force: true });
            } catch (e) {
                console.error(`[Retention] Failed to delete ${item.path}`, e);
            }
        });
    }
}

module.exports = new RetentionManager();
