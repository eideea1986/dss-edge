const BaseAdapter = require('./BaseAdapter');

class HikvisionAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        // Standard Hikvision ISAPI base URL
        this.baseUrl = `http://${config.ip}:${config.port || 80}/ISAPI`;
        this.client = null;
    }

    async getClient() {
        if (!this.client) {
            try {
                // Dynamic import for ESM compatibility
                const module = await import('digest-fetch');
                const DigestFetch = module.default || module;
                this.client = new DigestFetch(this.config.user, this.config.pass);
            } catch (e) {
                console.error(`[HikvisionAdapter] Failed to load digest-fetch: ${e.message}`);
                throw e;
            }
        }
        return this.client;
    }

    async connect() {
        try {
            console.log(`[HikvisionAdapter] Attempting connection to ${this.config.ip}...`);
            const client = await this.getClient();

            // 1. Try Standard ISAPI (HTTP)
            try {
                const res = await client.fetch(`${this.baseUrl}/System/deviceInfo`, {
                    method: 'GET',
                    timeout: 3000
                });

                if (res.ok) {
                    this.connected = true;
                    console.log(`[HikvisionAdapter] Connected successfully via ISAPI (HTTP) to ${this.config.ip}`);
                    return true;
                }
                console.warn(`[HikvisionAdapter] HTTP Check failed (${res.status}). Trying RTSP Port...`);
            } catch (httpErr) {
                console.warn(`[HikvisionAdapter] HTTP Connection error: ${httpErr.message}. Trying RTSP Port...`);
            }

            // 2. Fallback: Check TCP Port 554 (RTSP)
            // If ISAPI fails (e.g. ONVIF user without Web access), check if RTSP port is open.
            const tcpConnected = await this.checkTcpPort(this.config.ip, 554);
            if (tcpConnected) {
                this.connected = true;
                console.log(`[HikvisionAdapter] Connected successfully via TCP/RTSP Port 554 to ${this.config.ip}`);
                return true;
            }

            console.error(`[HikvisionAdapter] All connection attempts failed for ${this.config.ip}`);
            this.connected = false;
            return false;
        } catch (e) {
            console.error(`[HikvisionAdapter] Critcal connection error for ${this.config.ip}: ${e.message}`);
            this.connected = false;
            return false;
        }
    }

    checkTcpPort(host, port, timeout = 2000) {
        return new Promise((resolve) => {
            const net = require('net');
            const socket = new net.Socket();

            socket.setTimeout(timeout);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', (err) => {
                socket.destroy();
                resolve(false);
            });

            socket.connect(port, host);
        });
    }

    async getStreamUri(channel = '101') {
        const safeUser = encodeURIComponent(this.config.user);
        const safePass = encodeURIComponent(this.config.pass);
        const model = (this.config.model || "").toUpperCase();

        // --- RTSP LIBRARY (Hikvision) ---
        // 1. NVR / DVR Pattern (Usually detected by checking channel count or model name containing DS-7xxx, DS-9xxx)
        if (model.includes("DS-7") || model.includes("DS-9") || model.includes("NVR") || model.includes("DVR")) {
            // NVRs often use the same /Streaming/Channels/XX01 pattern but channel ID is key
            // Start with standard ISAPI
            return `rtsp://${safeUser}:${safePass}@${this.config.ip}:554/Streaming/Channels/${channel}`;
        }

        // 2. Old/Legacy IP Cameras
        if (model.includes("RAPTUR") || model.includes("DS-2CD2") === false && model.includes("OLD")) {
            // Example legacy path (rare nowadays but possible)
            // return `rtsp://${safeUser}:${safePass}@${this.config.ip}:554/h264/ch${channel}/main/av_stream`; 
            // Defaulting to ISAPI as it's 99% standard for Hikvision
        }

        // 3. Standard ISAPI (Default for most DS-2CD series)
        return `rtsp://${safeUser}:${safePass}@${this.config.ip}:554/Streaming/Channels/${channel}`;
    }

    async request(method, path, body = null) {
        // Path should start with / (e.g. /System/deviceInfo)
        const url = `${this.baseUrl}${path}`;
        const options = {
            method,
            headers: body ? { 'Content-Type': 'application/xml' } : {},
            body: body,
            timeout: 5000
        };

        try {
            const client = await this.getClient();
            const res = await client.fetch(url, options);
            if (!res.ok) {
                const errBody = await res.text().catch(() => 'no body');
                throw new Error(`HTTP Error ${res.status}: ${res.statusText}. Response: ${errBody}`);
            }
            return await res.text();
        } catch (e) {
            console.error(`[HikvisionAdapter] Request error (${path}): ${e.message}`);
            throw e;
        }
    }

    async getDeviceInfo() {
        let model = 'Hikvision Device';
        try {
            const infoXml = await this.request('GET', '/System/deviceInfo');
            const modelMatch = infoXml.match(/<model>([^<]+)<\/model>/);
            if (modelMatch) model = modelMatch[1];
        } catch (e) {
            console.warn(`[HikvisionAdapter] Failed to fetch deviceInfo XML: ${e.message}`);
        }

        return {
            manufacturer: 'Hikvision',
            model: model,
            channels: 1, // Most Hik cameras are 1 chan, NVRs would need /System/Video/inputs/channels
            streams: {
                main: await this.getStreamUri('101'),
                sub: await this.getStreamUri('102')
            }
        };
    }
}

module.exports = HikvisionAdapter;
