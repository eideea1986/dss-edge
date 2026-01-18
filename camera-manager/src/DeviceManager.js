const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DeviceFactory = require('../adapters/DeviceFactory');

class DeviceManager {
    constructor() {
        this.configPath = path.resolve(__dirname, '../../config/cameras.json');
        this.go2rtcPath = path.resolve(__dirname, '../../go2rtc.yaml');
        this.commonPatterns = [
            { id: 'dahua', main: '/cam/realmonitor?channel=1&subtype=0', sub: '/cam/realmonitor?channel=1&subtype=1' },
            { id: 'hikvision', main: '/Streaming/Channels/101', sub: '/Streaming/Channels/102' },
            { id: 'uniview', main: '/live/main', sub: '/live/sub' },
            { id: 'generic_h264', main: '/h264/ch1/main/av_stream', sub: '/h264/ch1/sub/av_stream' }
        ];
        this.commonCreds = [
            { u: 'admin', p: 'a1b2c3d4' },
            { u: 'admin', p: 'admin' },
            { u: 'admin', p: '123456' },
            { u: 'webadmin', p: 'webadmin' },
            { u: 'admin', p: 'TeamS_2k25!' }
        ];
        this.adapters = {};
    }

    loadCameras() {
        try {
            if (!fs.existsSync(this.configPath)) return [];
            const data = fs.readFileSync(this.configPath, 'utf8').replace(/^\uFEFF/, '');
            let cams = JSON.parse(data);
            const map = {};
            cams.forEach(c => map[c.id] = c);
            return Object.values(map);
        } catch (e) {
            console.error("[DeviceManager] Load Error:", e);
            return [];
        }
    }

    saveCameras(cameras) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(cameras, null, 2));
        } catch (e) {
            console.error("[DeviceManager] Save Error:", e);
        }
    }

    /**
     * ENTERPRISE: Refresh device config from camera
     */
    async refreshCameraConfig(cam) {
        console.log(`[DeviceManager] Refreshing config for ${cam.id} (${cam.ip})`);
        try {
            const adapter = DeviceFactory.createAdapter(cam);
            const connected = await adapter.connect();
            if (connected) {
                const info = await adapter.getDeviceInfo();
                console.log(`[DeviceManager] Fetched Info for ${cam.id}:`, info.params);

                // Update local config params if bidirectional is enabled
                if (info.params) {
                    cam.params = { ...(cam.params || {}), ...info.params };
                }
                return true;
            }
        } catch (e) {
            console.error(`[DeviceManager] Refresh Failed for ${cam.id}:`, e.message);
        }
        return false;
    }

    /**
     * ENTERPRISE: Sync local config to physical camera
     */
    async syncConfigToDevice(cam) {
        if (!cam.params) return false;
        console.log(`[DeviceManager] Syncing local config to camera ${cam.id}`);
        try {
            const adapter = DeviceFactory.createAdapter(cam);
            await adapter.connect();
            await adapter.applyDeviceConfig(cam.params);
            console.log(`[DeviceManager] Successfully synced config to ${cam.id}`);
            return true;
        } catch (e) {
            console.error(`[DeviceManager] Sync to Device Failed for ${cam.id}:`, e.message);
            return false;
        }
    }

    provisionGo2RTC(cameras) {
        let yaml = "streams:\n";
        cameras.forEach(cam => {
            if (cam.enabled !== false) {
                const hd = (cam.rtspMain || (cam.streams && cam.streams.main) || cam.rtsp || "").trim();
                const sub = (cam.rtsp || (cam.streams && cam.streams.sub) || "").trim();
                const suffix = "#backchannel=0#tcp";

                if (hd) {
                    yaml += `  ${cam.id}_hd: "${hd}${suffix}"\n`;
                    yaml += `  ${cam.id}: "${hd}${suffix}"\n`;
                }
                if (sub) {
                    yaml += `  ${cam.id}_low: "${sub}${suffix}"\n`;
                    yaml += `  ${cam.id}_sub: "${sub}${suffix}"\n`;
                    if (!hd) yaml += `  ${cam.id}: "${sub}${suffix}"\n`;
                }
            }
        });
        try {
            fs.writeFileSync(this.go2rtcPath, yaml);
        } catch (e) {
            console.error("[DeviceManager] Go2RTC Provision Error:", e);
        }
    }

    async discoverPaths(ip, currentCam) {
        console.log(`[DeviceManager] Discovering paths for ${ip}...`);
        const credsToTry = [...this.commonCreds];
        if (currentCam?.user) credsToTry.unshift({ u: currentCam.user, p: currentCam.pass });

        for (const cred of credsToTry) {
            for (const pat of this.commonPatterns) {
                const subUrl = `rtsp://${cred.u}:${cred.p}@${ip}:554${pat.sub}`;
                try {
                    const working = await new Promise((resolve) => {
                        const { exec } = require('child_process');
                        exec(`ffmpeg -rtsp_transport tcp -i "${subUrl}" -t 1 -f null /dev/null`, (err) => {
                            resolve(!err);
                        });
                    });
                    if (working) {
                        return {
                            user: cred.u,
                            pass: cred.p,
                            rtsp: subUrl,
                            rtspMain: `rtsp://${cred.u}:${cred.p}@${ip}:554${pat.main}`
                        };
                    }
                } catch (e) { }
            }
        }
        return null;
    }
}

module.exports = new DeviceManager();
