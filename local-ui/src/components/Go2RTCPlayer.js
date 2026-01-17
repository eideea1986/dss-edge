import React, { useEffect, useRef } from "react";

/**
 * GLOBAL STREAM POOL (session-scoped, NU React-scoped)
 */
const streamPool = new Map();

/**
 * CONFIG FIX: Use the unified /rtc proxy on the main API port
 */
const GO2RTC_API = `${window.location.origin}/rtc`;

async function acquireStream(camId, type = "sub") {
    const key = `${camId}_${type}`;

    if (streamPool.has(key)) {
        const entry = streamPool.get(key);
        entry.refs++;
        console.log(`[Go2RTCPlayer] Reusing stream for ${key}, refs: ${entry.refs}`);
        return entry;
    }

    console.log(`[Go2RTCPlayer] Creating new WebRTC connection for ${key}`);
    const pc = new RTCPeerConnection({ iceServers: [] });
    const media = new MediaStream();

    pc.ontrack = (e) => {
        console.log(`[Go2RTCPlayer] Track received for ${key}`);
        media.addTrack(e.track);
    };

    pc.addTransceiver("video", { direction: "recvonly" });

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(
            `${GO2RTC_API}/api/webrtc?src=${key}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/sdp" },
                body: offer.sdp
            }
        );

        if (!res.ok) {
            throw new Error(`WebRTC signaling failed: ${res.status}`);
        }

        const answer = await res.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });

        const entry = {
            pc,
            media,
            refs: 1
        };

        streamPool.set(key, entry);
        return entry;
    } catch (err) {
        pc.close();
        throw err;
    }
}

function releaseStream(camId, type = "sub") {
    const key = `${camId}_${type}`;
    const entry = streamPool.get(key);
    if (!entry) return;

    entry.refs--;
    console.log(`[Go2RTCPlayer] Released stream for ${key}, refs: ${entry.refs}`);

    // 15s grace period to prevent flickering during tab switches
    if (entry.refs <= 0) {
        setTimeout(() => {
            const currentEntry = streamPool.get(key);
            if (currentEntry && currentEntry.refs <= 0) {
                console.log(`[Go2RTCPlayer] Closing idle connection for ${key}`);
                currentEntry.pc.close();
                streamPool.delete(key);
            }
        }, 15000);
    }
}

/**
 * UI COMPONENT – DOAR ATAȘARE
 */
export default function Go2RTCPlayer({ camId, streamType = "sub", style, isHidden }) {
    const videoRef = useRef(null);
    const type = streamType === 'low' || streamType === 'sub' ? 'sub' : 'hd';

    useEffect(() => {
        if (isHidden || !camId) return;

        let active = true;
        let streamEntry;

        acquireStream(camId, type)
            .then((entry) => {
                if (!active) {
                    releaseStream(camId, type);
                    return;
                }
                streamEntry = entry;
                if (videoRef.current) {
                    videoRef.current.srcObject = entry.media;
                    videoRef.current.play().catch(() => { });
                }
            })
            .catch((err) => {
                console.error(`[Go2RTCPlayer] Error for ${camId}_${type}:`, err);
            });

        return () => {
            active = false;
            if (streamEntry) {
                releaseStream(camId, type);
            }
        };
    }, [camId, type, isHidden]);

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
        </div>
    );
}
