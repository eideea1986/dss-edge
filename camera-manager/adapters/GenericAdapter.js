const BaseAdapter = require('./BaseAdapter');
const onvif = require('node-onvif');

class GenericAdapter extends BaseAdapter {
    async connect() {
        try {
            console.log(`[GenericAdapter] Connecting via ONVIF to ${this.config.ip}...`);

            // initialize ONVIF device
            this.device = new onvif.OnvifDevice({
                xaddr: `http://${this.config.ip}:${this.config.port || 80}/onvif/device_service`,
                user: this.config.user,
                pass: this.config.pass
            });

            // Attempt to initialize (connects + auth)
            // Timeout promise to prevent hang
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("ONVIF Init Timeout")), 5000));
            await Promise.race([this.device.init(), timeout]);

            console.log(`[GenericAdapter] ONVIF Init Success for ${this.config.ip}`);
            this.connected = true;

            // Fetch Profiles & Stream URIs
            let profiles = [];
            try { profiles = this.device.getProfiles(); } catch (e) { }

            if (profiles.length > 0) {
                // Try to get URL for the first profile (usually Main Stream)
                try {
                    let rawUrl = await this.device.getUdpStreamUrl();
                    if (!rawUrl) {
                        const firstProfile = profiles[0].token;
                        rawUrl = await this.device.services.media.getStreamUri({
                            ProfileToken: firstProfile,
                            Protocol: 'RTSP'
                        }).then(res => res.Uri);
                    }

                    if (rawUrl) {
                        this.streamUrl = rawUrl.replace(/"/g, '').trim();
                    }
                } catch (urlErr) { }
            }

            // ENTERPRISE: Time Sync on Connect
            try {
                const now = new Date();
                await this.device.services.device.setSystemDateAndTime({
                    DateTimeType: 'Manual',
                    DaylightSavings: false,
                    UTCDateTime: {
                        Date: { Year: now.getUTCFullYear(), Month: now.getUTCMonth() + 1, Day: now.getUTCDate() },
                        Time: { Hour: now.getUTCHours(), Minute: now.getUTCMinutes(), Second: now.getUTCSeconds() }
                    }
                });
            } catch (timeErr) { }

            return true;
        } catch (e) {
            console.warn(`[GenericAdapter] ONVIF Connection Failed for ${this.config.ip}: ${e.message}`);
            return true; // Return true to allow RTSP fallback in factory
        }
    }

    async getStreamUri(channelId = '101') {
        const isSub = (channelId === '102' || channelId === '2');
        if (this.config) {
            if (!isSub && this.config.rtspHd) return this.config.rtspHd;
            if (isSub && this.config.rtsp) return this.config.rtsp;
        }
        if (this.streamUrl && !isSub) return this.streamUrl;

        // HEURISTIC FALLBACK
        const manuf = (this.config.manufacturer || '').toLowerCase();
        if (manuf.includes('dahua')) {
            const subtype = isSub ? 1 : 0;
            return `rtsp://${this.config.user}:${this.config.pass}@${this.config.ip}:554/cam/realmonitor?channel=1&subtype=${subtype}`;
        }
        if (manuf.includes('hikvision')) {
            const chan = isSub ? 102 : 101;
            return `rtsp://${this.config.user}:${this.config.pass}@${this.config.ip}:554/Streaming/Channels/${chan}`;
        }
        return this.config.rtsp || "";
    }

    /**
     * ENTERPRISE: Write config to camera via ONVIF
     * Supports: codec, resolution, fps, gop
     */
    async applyDeviceConfig(newConfig) {
        if (!this.device || !this.device.services.media) {
            throw new Error("ONVIF Device not initialized or Media service missing");
        }

        try {
            const profiles = this.device.getProfiles();
            if (profiles.length === 0) throw new Error("No profiles found on device");

            // We apply to the first profile (Main)
            const mainProfile = profiles[0];
            const videoConfig = mainProfile.VideoEncoderConfiguration;
            if (!videoConfig) throw new Error("No VideoEncoderConfiguration found for main profile");

            const params = {
                ConfigurationToken: videoConfig.token,
                ForcePersistence: true,
                Configuration: {
                    ...videoConfig
                }
            };

            // Map scope changes
            if (newConfig.codec) params.Configuration.Encoding = newConfig.codec; // e.g. 'H264'
            if (newConfig.fps) params.Configuration.RateControl.FrameRateLimit = parseInt(newConfig.fps);
            if (newConfig.gop) params.Configuration.H264.GovLength = parseInt(newConfig.gop);
            if (newConfig.resolution) {
                const [w, h] = newConfig.resolution.split('x');
                params.Configuration.Resolution = { Width: parseInt(w), Height: parseInt(h) };
            }

            console.log(`[GenericAdapter] Applying ONVIF SetVideoEncoderConfiguration to ${this.config.ip}`);
            await this.device.services.media.setVideoEncoderConfiguration(params);
            return true;
        } catch (e) {
            console.error(`[GenericAdapter] Failed to apply ONVIF config: ${e.message}`);
            throw e;
        }
    }

    async getDeviceInfo() {
        let model = 'Generic ONVIF';
        let manufacturer = this.config.manufacturer || 'Generic';
        let videoParams = {};

        if (this.device) {
            try {
                const info = this.device.getInformation();
                if (info.Model) model = info.Model;
                if (info.Manufacturer) manufacturer = info.Manufacturer;

                const profiles = this.device.getProfiles();
                if (profiles.length > 0 && profiles[0].VideoEncoderConfiguration) {
                    const c = profiles[0].VideoEncoderConfiguration;
                    videoParams = {
                        codec: c.Encoding,
                        resolution: `${c.Resolution.Width}x${c.Resolution.Height}`,
                        fps: c.RateControl.FrameRateLimit,
                        gop: c.H264?.GovLength || 0
                    };
                }
            } catch (e) { }
        }

        return {
            manufacturer,
            model,
            channels: 1,
            streams: {
                main: await this.getStreamUri('101'),
                sub: await this.getStreamUri('102')
            },
            params: videoParams
        };
    }
}

module.exports = GenericAdapter;
