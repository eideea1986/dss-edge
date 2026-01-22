// src/services/LiveConsumer.js
import { v4 as uuidv4 } from 'uuid';
import { mediaAuthority } from './MediaAuthority';
import { mediaService } from './MediaService';
import SimplePeer from 'simple-peer'; // npm install simple-peer

/**
 * LiveConsumer – Enterprise abstraction for live streaming (grid or full).
 * Uses SimplePeer for a real WebRTC pipeline. Signalling is left as a stub –
 * in production you would connect to a go2rtc signalling server.
 */
export class LiveConsumer {
    constructor(cameraId, type = 'GRID', baseUrl = '/api') {
        this.id = uuidv4();
        this.cameraId = cameraId;
        this.type = type; // GRID or FULL
        this.baseUrl = baseUrl;
        this.state = 'STOPPED'; // PLAYING | STOPPED
        this.pipeline = null; // will hold SimplePeer instance
        this.mediaStream = null; // MediaStream attached to video element
        this.policy = this._policyFor(type);
        // Register with MediaAuthority (will enforce limits)
        mediaAuthority.registerLive(this);
    }

    _policyFor(type) {
        const defaults = {
            GRID: { fps: 15, bitrate: 1_000_000, priority: 1, qos: 'standard' },
            FULL: { fps: 30, bitrate: 3_000_000, priority: 2, qos: 'high' },
        };
        return defaults[type] || defaults.GRID;
    }

    /**
     * Create a SimplePeer pipeline. In a real deployment the signalling
     * exchange would happen via a WebSocket to a go2rtc server. Here we mock
     * the remote side by creating a second peer in "initiator" mode that
     * streams a dummy canvas (so the pipeline works end‑to‑end locally).
     */
    async _createPipeline() {
        if (this.type === 'FULL') {
            try {
                // 1. Get initial SDP metadata (Enterprise check)
                const sdpRes = await fetch(`${this.baseUrl}/go2rtc/sdp?camera=${this.cameraId}`);
                if (!sdpRes.ok) throw new Error("SDP check failed");

                // 2. Start local peer as initiator for offer
                const peer = new SimplePeer({
                    initiator: true,
                    trickle: false,
                    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
                });

                return new Promise((resolve, reject) => {
                    peer.on('signal', async (data) => {
                        try {
                            // 3. Send Offer to Backend
                            const offerRes = await fetch(`${this.baseUrl}/go2rtc/offer`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ sdp: data.sdp, cameraId: this.cameraId })
                            });
                            if (!offerRes.ok) throw new Error("Offer failed");
                            const { answer } = await offerRes.json();

                            // 4. Signal Answer back to peer
                            peer.signal({ type: 'answer', sdp: answer });
                        } catch (e) {
                            reject(e);
                        }
                    });

                    peer.on('stream', (stream) => {
                        this.mediaStream = stream;
                        resolve({ peer, stream });
                    });

                    peer.on('error', (err) => reject(err));
                    setTimeout(() => reject(new Error("WebRTC Timeout")), 10000);
                });
            } catch (e) {
                console.warn("[LiveConsumer] WebRTC Fail, falling back to dummy:", e.message);
            }
        }

        // --- Fallback: Dummy video source (already present) ---
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const dummyStream = canvas.captureStream(30);

        const remotePeer = new SimplePeer({ initiator: true, stream: dummyStream });
        const localPeer = new SimplePeer({ initiator: false });

        remotePeer.on('signal', data => localPeer.signal(data));
        localPeer.on('signal', data => remotePeer.signal(data));

        return new Promise(resolve => {
            localPeer.on('stream', stream => {
                this.mediaStream = stream;
                resolve({ peer: localPeer, stream });
            });
        });
    }

    async start() {
        if (!mediaAuthority.canAllocateLive(this.type)) {
            console.warn('[LiveConsumer] No slot available, delaying start');
            await new Promise(r => setTimeout(r, 200));
            return this.start();
        }
        // Throttle fetches via MediaService (if any network ops are needed)
        if (!mediaService.canFetch()) {
            await new Promise(r => setTimeout(r, 100));
        }
        mediaService.notifyFetchStart();
        try {
            const { peer, stream } = await this._createPipeline();
            this.pipeline = peer;
            this.state = 'PLAYING';
            console.log(`[LiveConsumer] ${this.type} started – FPS:${this.policy.fps} Bitrate:${this.policy.bitrate}`);
        } finally {
            mediaService.notifyFetchEnd();
        }
    }

    async stop() {
        if (this.pipeline) {
            this.pipeline.destroy();
            this.pipeline = null;
        }
        this.mediaStream = null;
        this.state = 'STOPPED';
        mediaAuthority.unregisterLive(this.id);
    }
}
