const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3');

class RetentionManager {
    constructor() {
        this.storageRoot = '/opt/dss-edge/storage';
        this.triggerPercent = 95;  // Start cleanup at 95%
        this.targetPercent = 90;   // Clean until 90%
        this.isCleaning = false;
    }

    async getDiskUsage() {
        return new Promise((resolve) => {
            exec(`df -h ${this.storageRoot}`, (err, stdout) => {
                if (err) {
                    console.error("[Retention] DF Error:", err);
                    return resolve(null);
                }

                try {
                    const lines = stdout.split("\n").filter(l => l.trim().length > 0);
                    if (lines.length < 2) return resolve(null);

                    const lastLine = lines[lines.length - 1];
                    const parts = lastLine.trim().split(/\s+/);

                    const usedPart = parts.find(p => p.includes('%'));
                    if (!usedPart) return resolve(null);

                    const usedPercent = parseInt(usedPart.replace("%", ""));
                    console.log(`[Retention] Disk usage: ${usedPercent}%`);
                    resolve(usedPercent);
                } catch (e) {
                    console.error("[Retention] Parse error:", e);
                    resolve(null);
                }
            });
        });
    }

    async getDiskSpace() {
        return new Promise((resolve) => {
            exec(`df -B1 ${this.storageRoot}`, (err, stdout) => {
                if (err) return resolve(null);

                try {
                    const lines = stdout.split("\n").filter(l => l.trim().length > 0);
                    if (lines.length < 2) return resolve(null);

                    const lastLine = lines[lines.length - 1];
                    const parts = lastLine.trim().split(/\s+/);

                    // Format: Filesystem Size Used Avail Use% Mounted
                    const totalBytes = parseInt(parts[1]);
                    const usedBytes = parseInt(parts[2]);

                    resolve({ totalBytes, usedBytes });
                } catch (e) {
                    return resolve(null);
                }
            });
        });
    }

    async startCleanupLoop() {
        console.log("[Retention] Starting monitoring (path: " + this.storageRoot + ")");
        this.checkAndPurge();
        setInterval(() => this.checkAndPurge(), 60 * 1000); // Every 60 seconds
    }

    async checkAndPurge() {
        if (this.isCleaning) {
            console.log("[Retention] Already cleaning, skipping...");
            return;
        }

        try {
            const usedPercent = await this.getDiskUsage();
            if (usedPercent === null) return;

            if (usedPercent >= this.triggerPercent) {
                console.warn(`[Retention] CRITICAL: ${usedPercent}% used. Starting intelligent purge...`);
                this.isCleaning = true;

                await this.intelligentPurge();

                this.isCleaning = false;
            }
        } catch (e) {
            console.error("[Retention] Error:", e);
            this.isCleaning = false;
        }
    }

    async intelligentPurge() {
        // Get disk space info
        const spaceInfo = await this.getDiskSpace();
        if (!spaceInfo) {
            console.error("[Retention] Cannot get disk space info");
            return;
        }

        const { totalBytes, usedBytes } = spaceInfo;
        const currentPercent = (usedBytes / totalBytes) * 100;

        // Calculate how much we need to free
        const targetUsedBytes = (this.targetPercent / 100) * totalBytes;
        const bytesToFree = usedBytes - targetUsedBytes;

        console.log(`[Retention] Current: ${currentPercent.toFixed(1)}%, Target: ${this.targetPercent}%`);
        console.log(`[Retention] Need to free: ${(bytesToFree / 1024 / 1024 / 1024).toFixed(2)} GB`);

        if (bytesToFree <= 0) {
            console.log("[Retention] Already below target, no cleanup needed");
            return;
        }

        // Get all .ts files sorted by age (oldest first)
        const oldestFiles = await this.getOldestFiles(bytesToFree);

        if (oldestFiles.length === 0) {
            console.warn("[Retention] No files found to delete!");
            return;
        }

        console.log(`[Retention] Deleting ${oldestFiles.length} oldest files...`);

        let deletedBytes = 0;
        let deletedCount = 0;

        for (const file of oldestFiles) {
            try {
                const stats = fs.statSync(file.path);
                fs.unlinkSync(file.path);
                deletedBytes += stats.size;
                deletedCount++;

                // Also delete from DB
                await this.deleteFromDB(file.path);

                if (deletedCount % 100 === 0) {
                    console.log(`[Retention] Deleted ${deletedCount} files, ${(deletedBytes / 1024 / 1024 / 1024).toFixed(2)} GB freed`);
                }
            } catch (e) {
                console.error(`[Retention] Error deleting ${file.path}:`, e.message);
            }
        }

        console.log(`[Retention] Cleanup complete: ${deletedCount} files, ${(deletedBytes / 1024 / 1024 / 1024).toFixed(2)} GB freed`);

        // Verify result
        const newUsage = await this.getDiskUsage();
        if (newUsage) {
            console.log(`[Retention] New disk usage: ${newUsage}%`);
        }
    }

    async getOldestFiles(bytesNeeded) {
        return new Promise((resolve) => {
            // Find all .ts files > 0 bytes, sorted by modification time (oldest first)
            // Added -size +0c to ignore empty files that clog the list
            const cmd = `find ${this.storageRoot} -type f -name "*.ts" -size +0c -printf '%T@ %s %p\\n' | sort -n`;

            // Increased buffer to 500MB to handle millions of files
            exec(cmd, { maxBuffer: 1024 * 1024 * 500 }, (err, stdout, stderr) => {
                if (err && !stdout) {
                    console.error("[Retention] Find critical error:", err);
                    return resolve([]);
                }

                if (stderr) console.warn("[Retention] Find stderr:", stderr);

                // Even if err exists (buffer exceeded), stdout might contain valid partial data
                const lines = stdout.trim().split('\n');
                const files = [];
                let totalBytes = 0;

                for (const line of lines) {
                    if (!line || line.length < 5) continue; // Skip empty lines

                    const parts = line.split(' ');
                    if (parts.length < 3) continue;

                    const size = parseInt(parts[1]);
                    // Double check size > 0 (redundant with find -size +0c but safe)
                    if (size <= 0) continue;

                    const filePath = parts.slice(2).join(' ');

                    files.push({ path: filePath, size });
                    totalBytes += size;

                    // Stop when we have enough files to delete (plus 20% buffer)
                    if (totalBytes >= bytesNeeded * 1.2) {
                        break;
                    }
                }

                console.log(`[Retention] Found ${files.length} oldest files totaling ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
                resolve(files);
            });
        });
    }

    async deleteFromDB(filePath) {
        // Extract camera ID and filename from path
        // Path format: /opt/dss-edge/storage/cam_XXXX/segments/YYYY-MM-DD/HH-MM-SS.ts
        const parts = filePath.split('/');
        const camId = parts.find(p => p.startsWith('cam_'));
        if (!camId) return;

        const fileName = parts[parts.length - 1];
        const dateDir = parts[parts.length - 2];
        const relativeFile = `${dateDir}/${fileName}`;

        const dbPath = path.join(this.storageRoot, camId, 'index.db');
        if (!fs.existsSync(dbPath)) return;

        return new Promise((resolve) => {
            const db = new sqlite3.Database(dbPath);
            db.run(`DELETE FROM segments WHERE file = ?`, [relativeFile], (err) => {
                db.close();
                if (err) {
                    console.error(`[Retention] DB delete error for ${relativeFile}:`, err);
                }
                resolve();
            });
        });
    }
}

module.exports = new RetentionManager();
