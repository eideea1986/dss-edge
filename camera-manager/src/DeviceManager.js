const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    }

    loadCameras() {
        try {
            if (!fs.existsSync(this.configPath)) return [];
            const data = fs.readFileSync(this.configPath, 'utf8').replace(/^\uFEFF/, '');
            let cams = JSON.parse(data);
            // De-duplicate if needed (keep unique IDs)
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

    /**
     * Attempts to find a working RTSP path for a device.
     */
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
                        // Just probe headers (-t 1 is enough)
                        exec(`ffmpeg -rtsp_transport tcp -i "${subUrl}" -t 1 -f null /dev/null`, (err) => {
                            resolve(!err);
                        });
                    });

                    if (working) {
                        console.log(`[DeviceManager] Found working stream for ${ip}: ${pat.id}`);
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
