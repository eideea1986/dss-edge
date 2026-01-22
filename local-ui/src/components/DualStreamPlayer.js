import React, { useEffect, useRef, useState, useMemo } from "react";
import connectionPool from "../services/ConnectionPool"; // NEW

/**
 * SMART ENTERPRISE PLAYER - ZERO STUTTER ARCHITECTURE
 * 
 * Optimized for high-density grids (32+ cameras)
 * 
 * Version: 2.1 (Performance Stabilized)
 */

const GO2RTC_API = `${window.location.origin}/rtc`;

// Singleton Manager for WebRTC sessions
class WebRTCManager {
    constructor() {
        this.cache = new Map(); // key -> { pc, media, refs, lastActive }
        this.cleanupTimer = null;
    }

    async acquire(camId, type = "sub") {
        const key = `${camId}_${type}`;

        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            entry.refs++;
            entry.lastActive = Date.now();
            console.log(`[WebRTC] Reusing ${key} (refs: ${entry.refs})`);
            return entry;
        }

        console.log(`[WebRTC] Initializing new stream: ${key}`);
        const pc = new RTCPeerConnection({
            iceServers: [],
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        });

        const media = new MediaStream();

        pc.ontrack = (e) => {
            if (e.track.kind === 'video') {
                console.log(`[WebRTC] Track added for ${key}`);
                media.addTrack(e.track);
            }
        };

        const transceiver = pc.addTransceiver("video", { direction: "recvonly" });
        // Force H264 to prevent go2rtc CPU spikes from VP8 transcoding
        if (transceiver.setCodecPreferences && window.RTCRtpReceiver && RTCRtpReceiver.getCapabilities) {
            const capabilities = RTCRtpReceiver.getCapabilities('video');
            const h264Codecs = capabilities.codecs.filter(c => c.mimeType === 'video/H264');
            if (h264Codecs.length > 0) transceiver.setCodecPreferences(h264Codecs);
        }

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const res = await fetch(`${GO2RTC_API}/api/webrtc?src=${key}`, {
                method: "POST",
                headers: { "Content-Type": "application/sdp" },
                body: offer.sdp
            });

            if (!res.ok) throw new Error(`Status ${res.status}`);

            const answer = await res.text();
            await pc.setRemoteDescription({ type: "answer", sdp: answer });

            const entry = { pc, media, refs: 1, lastActive: Date.now() };
            this.cache.set(key, entry);
            return entry;
        } catch (err) {
            console.error(`[WebRTC] Setup failed for ${key}:`, err);
            pc.close();
            throw err;
        }
    }

    release(camId, type = "sub") {
        const key = `${camId}_${type}`;
        const entry = this.cache.get(key);
        if (!entry) return;

        entry.refs--;
        console.log(`[WebRTC] Released ${key} (refs: ${entry.refs})`);

        if (entry.refs <= 0) {
            // Enterprise Stability: 10s idle timeout to prevent flapping during rapid switching or scrolling
            setTimeout(() => {
                const current = this.cache.get(key);
                if (current && current.refs <= 0) {
                    console.log(`[WebRTC] Disconnecting idle stream: ${key}`);
                    current.pc.close();
                    this.cache.delete(key);
                }
            }, 10000);
        }
    }
}

const manager = new WebRTCManager();

export default function SmartDualStreamPlayer({ camId, isFullscreen, isHidden, isHovered, quality = 'sub', posterUrl, style }) {
    const videoRef = useRef(null);
    const [activeStream, setActiveStream] = useState(null);
    const [currentMode, setCurrentMode] = useState('off');
    const [isPlaying, setIsPlaying] = useState(false);

    // Determine target quality based on priority
    const targetMode = useMemo(() => {
        if (isHidden) return 'off';
        if (isFullscreen) return 'hd';
        return quality;
    }, [isHidden, isFullscreen, quality]);

    useEffect(() => {
        if (targetMode === 'off' || !camId) {
            if (activeStream) {
                manager.release(camId, currentMode);
                connectionPool.releaseSlot(); // release slot when stopping
                setActiveStream(null);
                setCurrentMode('off');
                setIsPlaying(false);
            }
            return;
        }

        let isMounted = true;
        const previousMode = currentMode;

        console.log(`[Player] ${camId} -> Target: ${targetMode} (prev: ${previousMode})`);

        // Acquire a connection slot before creating the WebRTC stream
        connectionPool.acquireSlot().then(() => {
            if (!isMounted) {
                // Component unmounted before slot granted
                connectionPool.releaseSlot();
                return;
            }
            manager.acquire(camId, targetMode).then(stream => {
                if (!isMounted) {
                    manager.release(camId, targetMode);
                    connectionPool.releaseSlot();
                    return;
                }

                if (previousMode !== 'off' && previousMode !== targetMode) {
                    manager.release(camId, previousMode);
                }

                setActiveStream(stream);
                setCurrentMode(targetMode);

                if (videoRef.current && videoRef.current.srcObject !== stream.media) {
                    videoRef.current.srcObject = stream.media;
                    videoRef.current.play().catch(() => { });
                }
            }).catch(err => {
                console.error(`[Player] ${camId} failed to load ${targetMode}`, err);
                // Release slot on error to avoid dead‑lock
                connectionPool.releaseSlot();
            });
        });

        return () => {
            isMounted = false;
        };
    }, [camId, targetMode]);

    // Ensure video is playing if activeStream exists but video is paused
    useEffect(() => {
        if (videoRef.current && activeStream && videoRef.current.paused) {
            videoRef.current.play().catch(() => { });
        }
    }, [activeStream]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (camId && currentMode !== 'off') {
                manager.release(camId, currentMode);
            }
        };
    }, []);

    const handlePlaying = () => setIsPlaying(true);
    const handleWaiting = () => setIsPlaying(false);

    return (
        <div style={{ ...style, position: "relative", background: "#000", overflow: "hidden" }}>
            {/* POSTER (Visible only if not playing) */}
            {posterUrl && !isPlaying && (
                <img
                    src={posterUrl}
                    alt=""
                    style={{
                        position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                        objectFit: "fill", zIndex: 1,
                        pointerEvents: "none"
                    }}
                    onError={(e) => e.target.style.display = 'none'}
                />
            )}

            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                onPlaying={handlePlaying}
                onWaiting={handleWaiting}
                onCanPlay={() => videoRef.current.play()}
                style={{
                    width: "100%", height: "100%", objectFit: "fill",
                    background: "#000",
                    display: targetMode === 'off' ? 'none' : 'block'
                }}
            />

            {/* ERROR/LOADING OVERLAY */}
            {targetMode !== 'off' && !isPlaying && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", zIndex: 2 }}>
                    <div style={{ fontSize: 9, color: "#aaa" }}>...</div>
                </div>
            )}
        </div>
    );
}
