const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class RetentionManager {
    constructor() {
        // ACTUAL STORAGE PATH used by C++ Recorder
        this.storageRoot = '/opt/dss-edge/storage';

        // TRIGGER CLEANUP: When FREE < 5% (Usage > 95%)
        this.minFreePercent = 5;

        // STOP CLEANUP: When FREE > 10% (Usage < 90%)
        this.targetFreePercent = 10;

        this.isCleaning = false;
    }

    async getDiskUsage() {
        return new Promise((resolve) => {
            // Check the partition where storageRoot resides
            exec("df -h " + this.storageRoot, (err, stdout) => {
                if (err) {
                    console.error("[Retention] DF Error:", err);
                    return resolve(null);
                }
                const lines = stdout.split("\n").filter(l => l.trim().length > 0);
                if (lines.length < 2) return resolve(null);

                // Parse last line
                const lastLine = lines[lines.length - 1];
                const parts = lastLine.trim().split(/\s+/);

                // Find column with %
                const usedPart = parts.find(p => p.includes('%'));
                if (!usedPart) return resolve(null);
                const usedPercent = parseInt(usedPart.replace("%", ""));
                resolve(usedPercent);
            });
        });
    }

    async startCleanupLoop() {
        console.log("[Retention] Starting monitoring loop (Active Storage: " + this.storageRoot + ")");
        // Run immediately then every 60 seconds (More frequent checks)
        this.checkAndPurge();
        setInterval(() => this.checkAndPurge(), 60 * 1000);
    }

    async checkAndPurge() {
        if (this.isCleaning) return;
        try {
            const used = await this.getDiskUsage();
            if (used === null) return;

            // Trigger cleanup if usage > 95%
            if (used > (100 - this.minFreePercent)) {
                console.warn(`[Retention] CRITICAL DISK USAGE: ${used}%. Trigger > ${100 - this.minFreePercent}%. STARTING PURGE.`);

                this.isCleaning = true;
                await this.purgeOldestContent();
                this.isCleaning = false;

                // If critical, check again very soon to create a rapid purge loop
                setTimeout(() => this.checkAndPurge(), 2000);
            }
        } catch (e) {
            console.error("[Retention] Loop error:", e);
            this.isCleaning = false;
        }
    }

    async purgeOldestContent() {
        return new Promise((resolve) => {
            if (!fs.existsSync(this.storageRoot)) return resolve();

            console.log("[Retention] Executing Native High-Performance Purge (Top 2000 Oldest Segments)...");

            // NATIVE SHELL OPTIMIZATION
            // Finds and deletes oldest 2000 .ts files in one go. 
            // -printf '%T@ %p\n' prints timestamp and path
            // sort -n sorts by timestamp
            const cmd = `find ${this.storageRoot} -type f -name "*.ts" -printf '%T@ %p\\n' | sort -n | head -n 2000 | cut -d' ' -f2- | tr '\\n' '\\0' | xargs -0 rm -f`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
                if (err) {
                    console.error("[Retention] Native Purge Error:", stderr);
                } else {
                    console.log("[Retention] Batch Purge Complete.");
                }
                resolve();
            });
        });
    }
}

module.exports = new RetentionManager();
