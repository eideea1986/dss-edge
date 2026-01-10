const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const AdmZip = require("adm-zip");

// Configure multer for file upload
const upload = multer({
    dest: "/tmp/edge-updates/",
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Ensure upload directory exists
if (!fs.existsSync("/tmp/edge-updates")) {
    fs.mkdirSync("/tmp/edge-updates", { recursive: true });
}

/**
 * POST /system/update
 * Upload and apply update package
 */
router.post("/update", upload.single("update"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const uploadedFile = req.file.path;
        console.log(`[Update] Received update package: ${req.file.originalname}`);

        //Extract ZIP
        const zip = new AdmZip(uploadedFile);
        const extractPath = "/tmp/edge-updates/extracted";

        // Clean previous extraction
        if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
        }

        zip.extractAllTo(extractPath, true);
        console.log(`[Update] Extracted to ${extractPath}`);

        // Read manifest
        const manifestPath = path.join(extractPath, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
            throw new Error("Invalid update package: manifest.json missing");
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        console.log(`[Update] Manifest: ${JSON.stringify(manifest)}`);

        // Apply updates based on manifest
        const baseDir = "/opt/dss-edge";
        let filesUpdated = 0;

        for (const file of manifest.files || []) {
            const sourcePath = path.join(extractPath, file.path);
            const targetPath = path.join(baseDir, file.path);

            if (!fs.existsSync(sourcePath)) {
                console.warn(`[Update] File not found in package: ${file.path}`);
                continue;
            }

            // Ensure target directory exists
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Copy file
            fs.copyFileSync(sourcePath, targetPath);
            filesUpdated++;
            console.log(`[Update] Updated: ${file.path}`);
        }

        // Rebuild UI if UI files were updated
        if (manifest.rebuildUI) {
            console.log("[Update] Rebuilding UI...");
            await new Promise((resolve, reject) => {
                exec("cd /opt/dss-edge/local-ui && npm run build", (err, stdout, stderr) => {
                    if (err) {
                        console.error("[Update] UI build failed:", stderr);
                        reject(new Error("UI build failed"));
                    } else {
                        console.log("[Update] UI rebuilt successfully");
                        resolve();
                    }
                });
            });
        }

        // Restart services if needed
        if (manifest.restartServices) {
            console.log("[Update] Restarting services...");
            setTimeout(() => {
                exec("systemctl restart dss-edge", (err) => {
                    if (err) console.error("[Update] Restart failed:", err);
                });
            }, 2000);
        }

        // Cleanup
        fs.unlinkSync(uploadedFile);
        fs.rmSync(extractPath, { recursive: true, force: true });

        res.json({
            success: true,
            message: `Update applied successfully. ${filesUpdated} files updated.`,
            version: manifest.version
        });

    } catch (e) {
        console.error("[Update] Error:", e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /system/version
 * Get current system version
 */
router.get("/version", (req, res) => {
    try {
        const packagePath = path.join(__dirname, "../../package.json");
        if (fs.existsSync(packagePath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
            res.json({ version: pkg.version || "1.0.0" });
        } else {
            res.json({ version: "Unknown" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
