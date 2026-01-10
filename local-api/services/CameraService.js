const fs = require('fs');
const path = require('path');
const axios = require('axios');

const configPath = path.join(__dirname, "../../config/cameras.json");
const storageMapPath = path.join(__dirname, "../../recorder/storage_map.json");
const ABS_REC_ROOT = path.resolve(__dirname, "../../recorder/segments");

class CameraService {
    loadConfig() {
        try {
            if (!fs.existsSync(configPath)) return [];
            const data = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, '');
            const cams = JSON.parse(data);

            const storageMap = this.getStorageMap();
            return cams.map(c => {
                if (storageMap[c.id]) {
                    c.storagePath = `/recorder/segments/${storageMap[c.id]}`;
                    c.physicalPath = path.join(ABS_REC_ROOT, storageMap[c.id]);
                }
                return c;
            });
        } catch (e) {
            console.error("[CameraService] Load Error:", e.message);
            return [];
        }
    }

    getStorageMap() {
        try {
            if (fs.existsSync(storageMapPath)) {
                return JSON.parse(fs.readFileSync(storageMapPath, "utf8"));
            }
        } catch (e) {
            console.error("[CameraService] StorageMap Error:", e.message);
        }
        return {};
    }

    saveConfig(cams, skipRestart = false) {
        fs.writeFileSync(configPath, JSON.stringify(cams, null, 2));

        try {
            const Go2RTCService = require("./Go2RTCService");
            Go2RTCService.sync(cams);
        } catch (e) {
            console.error("[CameraService] Go2RTC Sync Failed:", e.message);
        }

        if (!skipRestart) {
            console.log("[CameraService] Config saved. New configuration active.");
        }
    }

    async getFullStatus() {
        const cams = this.loadConfig();
        // DEBUG: Explicit log to Journal
        console.log(`[CameraService] Checking Status via Go2RTC 1984 for ${cams.length} cams...`);

        try {
            const res = await axios.get("http://127.0.0.1:1984/api/streams", { timeout: 2000 });
            const streams = res.data || {};
            const keys = Object.keys(streams);
            console.log(`[CameraService] Go2RTC Response: ${keys.length} active streams.`);

            return cams.map(cam => {
                const streamID = cam.id;
                // Check if main stream exists (or _hd alias)
                const streamInfo = streams[streamID] || streams[`${streamID}_hd`];

                const isOnline = !!streamInfo;

                return {
                    ...cam,
                    connected: isOnline,
                    statusInfo: isOnline ? "Online" : "Offline",
                    fps: 0,
                    motion: false
                };
            });
        } catch (e) {
            console.error("[CameraService] Go2RTC API ERROR:", e.message);
            // Return error details in status to see in UI
            return cams.map(c => ({
                ...c,
                connected: false,
                statusInfo: `Go2RTC Error: ${e.code || "Unreachable"}`
            }));
        }
    }
}

module.exports = new CameraService();
