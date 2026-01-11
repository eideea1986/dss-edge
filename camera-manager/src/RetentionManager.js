const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class RetentionManager {
    constructor() {
        // ACTUAL STORAGE PATH used by C++ Recorder
        this.storageRoot = '/opt/dss-edge/storage';
        this.minFreePercent = 10; // Keep at least 10% free
        this.targetFreePercent = 15; // Clean up until 15% free
        this.isCleaning = false;
    }

    async getDiskUsage() {
        return new Promise((resolve) => {
            // Check the partition where storageRoot resides
            exec("df -h " + this.storageRoot, (err, stdout) => {
                if (err) return resolve(null);
                const lines = stdout.split("\n");
                if (lines.length < 2) return resolve(null);
                // Handle possible multi-line output if filesystem name is long
                const lastLine = lines[lines.length - 1];
                const parts = lastLine.trim().split(/\s+/);
                // Filesystem Size Used Avail Use% Mounted
                // The Use% is usually the 5th column (index 4)
                const usedPart = parts.find(p => p.includes('%'));
                if (!usedPart) return resolve(null);
                const usedPercent = parseInt(usedPart.replace("%", ""));
                resolve(usedPercent);
            });
        });
    }

    async startCleanupLoop() {
        console.log("[Retention] Starting monitoring loop (Active Storage: " + this.storageRoot + ")");
        // Run immediately then every 5 mins
        this.checkAndPurge();
        setInterval(() => this.checkAndPurge(), 5 * 60 * 1000);
    }

    async checkAndPurge() {
        if (this.isCleaning) return;
        try {
            const used = await this.getDiskUsage();
            if (used === null) return;

            console.log(`[Retention] Disk usage: ${used}%`);
            if (used > (100 - this.minFreePercent)) {
                console.warn(`[Retention] Disk usage high (${used}%). Starting emergency purge...`);
                this.isCleaning = true;
                await this.purgeOldestContent();
                this.isCleaning = false;

                // Re-check after 10 seconds to see if we need more purging
                setTimeout(() => this.checkAndPurge(), 10000);
            }
        } catch (e) {
            console.error("[Retention] Loop error:", e);
            this.isCleaning = false;
        }
    }

    async purgeOldestContent() {
        try {
            if (!fs.existsSync(this.storageRoot)) return;

            const camDirs = fs.readdirSync(this.storageRoot);
            let allSegments = [];

            // 1. Collect ALL segments from ALL cameras
            for (const camId of camDirs) {
                const segDir = path.join(this.storageRoot, camId, 'segments');
                if (fs.existsSync(segDir)) {
                    const files = fs.readdirSync(segDir).filter(f => f.endsWith('.ts') || f.endsWith('.mp4'));
                    files.forEach(f => {
                        const fullPath = path.join(segDir, f);
                        try {
                            const stat = fs.statSync(fullPath);
                            allSegments.push({ path: fullPath, mtime: stat.mtimeMs });
                        } catch (e) { }
                    });
                }
            }

            if (allSegments.length === 0) {
                console.log("[Retention] No segments found to purge.");
                return;
            }

            // 2. Sort by Modification Time (Oldest first)
            allSegments.sort((a, b) => a.mtime - b.mtime);

            // 3. Delete top 200 oldest segments (approx 30 mins of footage per camera if 10s segments)
            // This is a "chunked" delete to avoid blocking too long and to allow disk to respirate.
            const toDelete = allSegments.slice(0, 200);
            console.log(`[Retention] Deleting ${toDelete.length} oldest segments...`);

            toDelete.forEach(item => {
                try {
                    fs.unlinkSync(item.path);
                } catch (e) {
                    console.error(`[Retention] Failed to delete ${item.path}`, e);
                }
            });

            console.log(`[Retention] Purge complete. Freed ~${toDelete.length * 2}MB`);
        } catch (e) {
            console.error("[Retention] Purge Failed:", e);
        }
    }
}

module.exports = new RetentionManager();

