const BaseAdapter = require('./BaseAdapter');
const onvif = require('node-onvif');

class GenericAdapter extends BaseAdapter {
    async connect() {
        const fs = require('fs');
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

            // Fetch Profiles & Stream URIs
            let profiles = [];
            try { profiles = this.device.getProfiles(); } catch (e) { }
            console.log(`[GenericAdapter] Found ${profiles.length} profiles for ${this.config.ip}`);

            if (profiles.length > 0) {
                // Try to get URL for the first profile (usually Main Stream)
                try {
                    let rawUrl = await this.device.getUdpStreamUrl();
                    if (!rawUrl) {
                        // Try secondary method if getUdpStreamUrl failed
                        const firstProfile = profiles[0].token;
                        rawUrl = await this.device.services.media.getStreamUri({
                            ProfileToken: firstProfile,
                            Protocol: 'RTSP'
                        }).then(res => res.Uri);
                    }

                    if (rawUrl) {
                        this.streamUrl = rawUrl.replace(/"/g, '').trim();
                        console.log(`[GenericAdapter] Discovered Stream URL: ${this.streamUrl}`);
                    }
                } catch (urlErr) {
                    console.warn(`[GenericAdapter] Failed to fetch stream URL: ${urlErr.message}`);
                }
            }

            // TIME SYNC FIX
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
            // Return true regarding adapter creation success, so we can fall back to RTSP URL if provided manually
            // But we should mark it as failed probing if we rely purely on ONVIF. 
            // Existing logic returns true, which means "Adapter Ready". 
            // If ONVIF fails, we will rely on getStreamUri's heuristic fallback.
            return true;
        }
    }

    async getStreamUri(channelId = '101') {
        const isSub = (channelId === '102' || channelId === '2');
        // First, if explicit RTSP URLs are provided in config (Trassir case), return them
        if (this.config) {
            if (!isSub && this.config.rtspHd) {
                return this.config.rtspHd;
            }
            if (isSub && this.config.rtsp) {
                return this.config.rtsp;
            }
        }
        if (this.streamUrl && this.streamUrl.length > 5 && !isSub) {
            return this.streamUrl;
        }

        // HEURISTIC FALLBACK: Guessed patterns based on manufacturer hints
        const manuf = (this.config.manufacturer || '').toLowerCase();
        if (manuf.includes('dahua')) {
            const subtype = isSub ? 1 : 0;
            return `rtsp://${this.config.user}:${this.config.pass}@${this.config.ip}:554/cam/realmonitor?channel=1&subtype=${subtype}`;
        }
        if (manuf.includes('hikvision')) {
            const chan = isSub ? 102 : 101;
            return `rtsp://${this.config.user}:${this.config.pass}@${this.config.ip}:554/Streaming/Channels/${chan}`;
        }
        if (manuf.includes('trassir')) {
            const stream = isSub ? 'sub' : 'main';
            return `rtsp://${this.config.user}:${this.config.pass}@${this.config.ip}:554/live/${stream}`;
        }

        return this.config.rtsp || "";
    }
    // Duplicate stray code removed
    // stray brace removed

    async getDeviceInfo() {
        let model = 'Generic ONVIF';
        let manufacturer = this.config.manufacturer || 'Generic';

        if (this.device) {
            try {
                const info = this.device.getInformation();
                if (info.Model) model = info.Model;
                if (info.Manufacturer) manufacturer = info.Manufacturer;
            } catch (e) { }
        }

        return {
            manufacturer,
            model,
            channels: 1,
            streams: {
                main: await this.getStreamUri('101'),
                sub: await this.getStreamUri('102')
            }
        };
    }
}

module.exports = GenericAdapter;
