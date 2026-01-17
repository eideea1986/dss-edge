export class MediaStreamManager {
    static instance = null;
    streams = new Map(); // key: streamName -> { pc, mediaStream, consumers: 0 }

    // Config
    GO2RTC_API_PORT = 8085; // Fixed port for signaling (API)

    static getInstance() {
        if (!MediaStreamManager.instance) {
            MediaStreamManager.instance = new MediaStreamManager();
        }
        return MediaStreamManager.instance;
    }

    // New helper to allow synchronous check
    hasActiveStream(camId, streamType = 'sub') {
        const suffix = streamType === 'hd' ? 'hd' : 'sub';
        const streamName = `${camId}_${suffix}`;
        return this.streams.has(streamName);
    }

    async getStream(camId, streamType = 'sub') {
        const suffix = streamType === 'hd' ? 'hd' : 'sub';
        const streamName = `${camId}_${suffix}`;

        if (!this.streams.has(streamName)) {
            console.log(`[StreamManager] Creating new session for ${streamName}`);
            const streamData = await this._createWebRTCConnection(streamName);
            this.streams.set(streamName, {
                ...streamData,
                consumers: 0,
                lastUsed: Date.now()
            });
        }

        const session = this.streams.get(streamName);
        session.consumers++;
        session.lastUsed = Date.now();
        console.log(`[StreamManager] Attached to ${streamName}. Consumers: ${session.consumers}`);

        return session.mediaStream;
    }

    releaseStream(camId, streamType = 'sub') {
        const suffix = streamType === 'hd' ? 'hd' : 'sub';
        const streamName = `${camId}_${suffix}`;

        if (this.streams.has(streamName)) {
            const session = this.streams.get(streamName);
            session.consumers--;
            console.log(`[StreamManager] Released ${streamName}. Remaining: ${session.consumers}`);

            // OPTIONAL: Cleanup logic if consumers stay 0 for too long?
            // For persistent grid, we leave it open.
        }
    }

    async _createWebRTCConnection(streamName) {
        return new Promise(async (resolve, reject) => {
            const pc = new RTCPeerConnection({
                iceServers: [] // Force LAN
            });

            const transceivers = pc.addTransceiver('video', { direction: 'recvonly' });

            pc.ontrack = (event) => {
                resolve({ pc, mediaStream: event.streams[0] });
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            try {
                // Use explicit hostname to support remote access
                const apiUrl = `http://${window.location.hostname}:${this.GO2RTC_API_PORT}/api/webrtc?src=${streamName}`;
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/sdp' },
                    body: pc.localDescription.sdp
                });

                if (!res.ok) throw new Error(`Signaling failed: ${res.status}`);

                const answer = await res.text();
                await pc.setRemoteDescription({ type: 'answer', sdp: answer });
            } catch (e) {
                pc.close();
                reject(e);
            }
        });
    }

    closeAll() {
        this.streams.forEach(s => s.pc.close());
        this.streams.clear();
    }
}
