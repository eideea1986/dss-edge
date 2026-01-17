import React, { useEffect, useRef, useState } from "react";

/**
 * SMART DUAL STREAM MANAGER - Trassir-like with Smart Warm Standby
 * 
 * ARCHITECTURE:
 * - Grid: substream only (low CPU)
 * - Hover: pre-connect main stream (warm standby)
 * - Fullscreen: instant switch (main already connected)
 * 
 * CPU OPTIMIZATION:
 * - Only 1 main stream in warm standby at a time
 * - Grid idle: minimal overhead (25 substreams only)
 * - Switch: <200ms (connection already established)
 */

const GO2RTC_API = `${window.location.origin}/rtc`;
const streamPool = new Map();

/**
 * Acquire WebRTC stream (reuses existing connections)
 */
async function acquireStream(camId, type = "sub") {
    const key = `${camId}_${type}`;

    if (streamPool.has(key)) {
        const entry = streamPool.get(key);
        entry.refs++;
        console.log(`[SmartDual] Reusing ${key}, refs: ${entry.refs}`);
        return entry;
    }

    console.log(`[SmartDual] Creating WebRTC for ${key}`);
    const pc = new RTCPeerConnection({ iceServers: [] });
    const media = new MediaStream();

    pc.ontrack = (e) => {
        console.log(`[SmartDual] Track received for ${key}`);
        media.addTrack(e.track);
    };

    pc.addTransceiver("video", { direction: "recvonly" });

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(`${GO2RTC_API}/api/webrtc?src=${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/sdp" },
            body: offer.sdp
        });

        if (!res.ok) {
            throw new Error(`WebRTC failed: ${res.status}`);
        }

        const answer = await res.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });

        const entry = { pc, media, refs: 1 };
        streamPool.set(key, entry);
        return entry;
    } catch (err) {
        pc.close();
        throw err;
    }
}

/**
 * Release stream (with grace period)
 */
function releaseStream(camId, type = "sub") {
    const key = `${camId}_${type}`;
    const entry = streamPool.get(key);
    if (!entry) return;

    entry.refs--;
    console.log(`[SmartDual] Released ${key}, refs: ${entry.refs}`);

    if (entry.refs <= 0) {
        setTimeout(() => {
            const currentEntry = streamPool.get(key);
            if (currentEntry && currentEntry.refs <= 0) {
                console.log(`[SmartDual] Closing idle ${key}`);
                currentEntry.pc.close();
                streamPool.delete(key);
            }
        }, 5000); // 5s grace period (shorter for faster cleanup)
    }
}

/**
 * SMART DUAL STREAM PLAYER
 */
export default function SmartDualStreamPlayer({ camId, isFullscreen, isHidden, isHovered, style }) {
    const videoRef = useRef(null);
    const [subStream, setSubStream] = useState(null);
    const [mainStream, setMainStream] = useState(null);
    const [currentStream, setCurrentStream] = useState("sub");

    // Always acquire substream
    useEffect(() => {
        if (isHidden || !camId) return;

        let active = true;
        let subEntry;

        acquireStream(camId, "sub")
            .then((sub) => {
                if (!active) {
                    releaseStream(camId, "sub");
                    return;
                }
                subEntry = sub;
                setSubStream(sub);

                // Attach substream to video if not fullscreen
                if (videoRef.current && !isFullscreen) {
                    videoRef.current.srcObject = sub.media;
                    videoRef.current.play().catch(() => { });
                }
            })
            .catch((err) => {
                console.error(`[SmartDual] Error for sub ${camId}:`, err);
            });

        return () => {
            active = false;
            if (subEntry) releaseStream(camId, "sub");
        };
    }, [camId, isHidden, isFullscreen]);

    // SMART WARM STANDBY: Pre-connect main stream on HOVER or FULLSCREEN
    useEffect(() => {
        const shouldPreconnect = (isHovered || isFullscreen) && !isHidden && camId;

        if (!shouldPreconnect) {
            // Release main stream when not needed
            if (mainStream) {
                releaseStream(camId, "hd");
                setMainStream(null);
            }
            return;
        }

        let active = true;
        let mainEntry;

        acquireStream(camId, "hd")
            .then((main) => {
                if (!active) {
                    releaseStream(camId, "hd");
                    return;
                }
                mainEntry = main;
                setMainStream(main);

                // If fullscreen, attach immediately
                if (isFullscreen && videoRef.current) {
                    videoRef.current.srcObject = main.media;
                    videoRef.current.play().catch(() => { });
                    setCurrentStream("main");
                }
                // If just hovering, DON'T attach (warm standby)
            })
            .catch((err) => {
                console.error(`[SmartDual] Error for main ${camId}:`, err);
            });

        return () => {
            active = false;
            if (mainEntry) releaseStream(camId, "hd");
        };
    }, [isHovered, isFullscreen, camId, isHidden, mainStream]);

    // INSTANT SWITCH when fullscreen changes
    useEffect(() => {
        if (!videoRef.current) return;

        if (isFullscreen && mainStream) {
            // Switch to main
            console.log(`[SmartDual] Switching to MAIN for ${camId}`);
            videoRef.current.srcObject = mainStream.media;
            videoRef.current.play().catch(() => { });
            setCurrentStream("main");
        } else if (!isFullscreen && subStream) {
            // Switch back to sub
            console.log(`[SmartDual] Switching to SUB for ${camId}`);
            videoRef.current.srcObject = subStream.media;
            videoRef.current.play().catch(() => { });
            setCurrentStream("sub");
        }
    }, [isFullscreen, subStream, mainStream, camId]);

    return (
        <div style={{ ...style, position: "relative", background: "#000", width: "100%", height: "100%" }}>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "fill"
                }}
            />
            {/* Debug indicator */}
            {process.env.NODE_ENV === 'development' && (
                <div style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    background: "rgba(0,0,0,0.7)",
                    color: mainStream ? "#0f0" : "#ff0",
                    padding: "2px 6px",
                    fontSize: 10,
                    fontFamily: "monospace"
                }}>
                    {currentStream.toUpperCase()} {mainStream && !isFullscreen ? "(STANDBY)" : ""}
                </div>
            )}
        </div>
    );
}
