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
export default function SmartDualStreamPlayer({ camId, isFullscreen, isHidden, isHovered, posterUrl, style }) {
    const videoRef = useRef(null);
    const [subStream, setSubStream] = useState(null);
    const [mainStream, setMainStream] = useState(null);
    const [currentStream, setCurrentStream] = useState("sub");
    const [posterVisible, setPosterVisible] = useState(true);

    // Reset poster visibility when switching modes or cameras
    useEffect(() => {
        setPosterVisible(true);
    }, [camId, isFullscreen]);

    // Handle video play event to hide poster
    const handleCanPlay = () => {
        // Delay slighty to ensure frame is rendered
        // setTimeout(() => setPosterVisible(false), 100);
        setPosterVisible(false);
    };

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

    // SMART WARM STANDBY with DEBOUNCE: Pre-connect main stream on sustained HOVER or FULLSCREEN
    useEffect(() => {
        let debounceTimer;
        let mainEntry;

        const cleanup = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            if (mainEntry) releaseStream(camId, "hd");
        };

        // Immediate connection for fullscreen
        if (isFullscreen && !isHidden && camId) {
            acquireStream(camId, "hd")
                .then((main) => {
                    mainEntry = main;
                    setMainStream(main);
                    if (videoRef.current) {
                        videoRef.current.srcObject = main.media;
                        videoRef.current.play().catch(() => { });
                        setCurrentStream("main");
                    }
                })
                .catch((err) => console.error(`[SmartDual] Error for main ${camId}:`, err));
        }
        // Debounced connection for hover (800ms delay)
        else if (isHovered && !isHidden && camId && !isFullscreen) {
            debounceTimer = setTimeout(() => {
                console.log(`[SmartDual] Hover sustained - pre-connecting main for ${camId}`);
                acquireStream(camId, "hd")
                    .then((main) => {
                        mainEntry = main;
                        setMainStream(main);
                        // Don't attach - warm standby only
                    })
                    .catch((err) => console.error(`[SmartDual] Error for main ${camId}:`, err));
            }, 800);
        }
        // Release main stream when not needed
        else if (mainStream && !isFullscreen && !isHovered) {
            releaseStream(camId, "hd");
            setMainStream(null);
        }

        return cleanup;
    }, [isHovered, isFullscreen, camId, isHidden]);

    // INSTANT SWITCH when fullscreen changes
    useEffect(() => {
        if (!videoRef.current) return;

        // Show poster briefly on switch
        setPosterVisible(true);

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
        <div style={{ ...style, position: "relative", background: "#000", width: "100%", height: "100%", overflow: "hidden" }}>
            {/* STATIC POSTER (Zero Latency UX) */}
            {posterUrl && (
                <img
                    src={posterUrl + `?_=${Date.now()}`} // Bust cache slightly or ensure latest
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "fill",
                        zIndex: 10,
                        opacity: posterVisible ? 1 : 0,
                        transition: "opacity 150ms ease-out",
                        pointerEvents: "none"
                    }}
                    onError={(e) => e.target.style.display = 'none'}
                    alt=""
                />
            )}

            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                onPlaying={handleCanPlay}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "fill",
                    position: "absolute",
                    top: 0,
                    left: 0
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
                    fontFamily: "monospace",
                    zIndex: 20
                }}>
                    {currentStream.toUpperCase()} {mainStream && !isFullscreen ? "(STANDBY)" : ""}
                </div>
            )}
        </div>
    );
}
