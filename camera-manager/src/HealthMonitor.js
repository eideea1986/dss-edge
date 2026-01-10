const http = require('http');

class HealthMonitor {
    constructor() {
        this.statusMap = {};
        this.go2rtcStreams = new Set();
        this.configuredCameras = [];
        // Start polling loop
        setInterval(() => this.pollGo2RTC(), 5000);
    }

    setConfiguredCameras(cameras) {
        this.configuredCameras = cameras;
        cameras.forEach(c => this.ensureEntry(c.id));
    }

    pollGo2RTC() {
        http.get('http://localhost:1984/api/streams', (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const streams = JSON.parse(data);
                    this.go2rtcStreams.clear();
                    Object.keys(streams).forEach(k => {
                        const s = streams[k];
                        if (s.producers && s.producers.some(p => p.url)) {
                            // Map stream_low/hd back to camId
                            const camId = k.replace('_low', '').replace('_hd', '');
                            this.go2rtcStreams.add(camId);
                        }
                    });
                } catch (e) { }
            });
        }).on('error', () => { });
    }

    reportPing(camId) {
        this.ensureEntry(camId);
        const metrics = this.statusMap[camId];
        metrics.lastPing = Date.now();
        metrics.frameCount++;

        if (Date.now() - metrics.lastFpsCalc >= 1000) {
            metrics.fps = metrics.frameCount;
            metrics.frameCount = 0;
            metrics.lastFpsCalc = Date.now();
        }
    }

    ensureEntry(camId) {
        if (!this.statusMap[camId]) {
            this.statusMap[camId] = {
                connected: false,
                fps: 0,
                frameCount: 0,
                lastPing: 0,
                lastFpsCalc: Date.now()
            };
        }
    }

    getGlobalStatus() {
        const result = {};
        const allIds = new Set([...Object.keys(this.statusMap), ...this.go2rtcStreams]);

        allIds.forEach(id => {
            this.ensureEntry(id);
            const m = this.statusMap[id];

            // CONNECTIVITY CHECK:
            // 1. Check direct internal heartbeat (FPS)
            // 2. OR check if Go2RTC reports it as active (Robust Fallback)
            const isGo2RTC = this.go2rtcStreams.has(id);
            const isInternal = (Date.now() - m.lastPing < 15000);

            let isConnected = isInternal;
            // If internal is dead but Go2RTC is alive, we trust Go2RTC connectivity
            // but FPS might be 0 because we aren't ingesting frames.
            if (!isConnected && isGo2RTC) {
                isConnected = true;
            }

            result[id] = {
                connected: isConnected,
                fps: m.fps, // Will be 0 if only Go2RTC is handling it (no analytics)
                status: isConnected ? "active" : "offline",
                source: isInternal ? "internal" : "go2rtc"
            };
        });
        return result;
    }
}

module.exports = new HealthMonitor();
