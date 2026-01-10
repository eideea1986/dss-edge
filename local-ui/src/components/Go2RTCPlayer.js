import React, { useEffect, useRef, useState } from 'react';

export default function Go2RTCPlayer({ camId, streamType = 'hd', style, onClick, onDoubleClick, isHidden }) {
    const videoRef = useRef(null);
    const pcRef = useRef(null);
    const [status, setStatus] = useState("init");

    // Fallback State: If 'low' fails, switch to 'hd'
    const [activeStreamType, setActiveStreamType] = useState(streamType);
    const [useMjpeg, setUseMjpeg] = useState(false);

    // Reset fallback if the requested streamType changes from props
    useEffect(() => {
        setActiveStreamType(streamType);
        setUseMjpeg(false);
    }, [streamType]);

    // Unified stream name logic for both WebRTC and MJPEG
    const suffix = activeStreamType === 'low' ? 'sub' : activeStreamType;
    const streamName = `${camId}_${suffix}`;

    useEffect(() => {
        if (useMjpeg) return;

        const connectWebRTC = async () => {
            setStatus("connecting");
            if (pcRef.current) pcRef.current.close();

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
            });
            pcRef.current = pc;

            pc.ontrack = (event) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = event.streams[0];
                    // play() returns promise, handle rejection
                    videoRef.current.play().catch(e => {
                        console.warn("Autoplay failed", e);
                    });
                    setStatus("playing");
                }
            };

            pc.addTransceiver('video', { direction: 'recvonly' });

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const apiUrl = `/rtc/api/webrtc?src=${streamName}`;
                const res = await fetch(apiUrl, { method: 'POST', body: pc.localDescription.sdp });

                if (!res.ok) throw new Error(`Go2RTC Error: ${res.status}`);

                const answerSdp = await res.text();
                if (pcRef.current && pcRef.current.signalingState !== 'closed') {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
                }
            } catch (e) {
                console.warn(`[Go2RTC] Failed to connect ${streamName}:`, e);
                // Fallback Logic
                if (activeStreamType === 'low' || activeStreamType === 'sub') { // Covers both
                    console.log(`[Go2RTC] Substream failed, trying Main...`);
                    setActiveStreamType('hd');
                } else if (!useMjpeg) {
                    // If both failed, fallback to MJPEG
                    console.log(`[Go2RTC] WebRTC failed completely, switching to MJPEG.`);
                    setUseMjpeg(true);
                }
            }
        };

        if (camId) connectWebRTC();

        return () => {
            if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
        };
    }, [camId, activeStreamType, useMjpeg, streamName]);

    return (
        <div className="rtc-player" style={{ ...style, position: "relative", background: "#000", overflow: "hidden", width: "100%", height: "100%" }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
        >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                {useMjpeg ? (
                    <img
                        className="rtc-player-el"
                        src={`/rtc/api/stream.mjpeg?src=${streamName}`}
                        style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
                        alt="Live Stream"
                    />
                ) : (
                    <video
                        className="rtc-player-el"
                        ref={videoRef}
                        style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
                        playsInline
                        muted
                        autoPlay
                    />
                )}
            </div>

            {status !== 'playing' && status !== 'init' && !useMjpeg && (
                <div style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "rgba(255,255,255,0.5)", fontSize: 12, pointerEvents: "none",
                    zIndex: 2
                }}>
                    {status === 'connecting' ? 'Connecting...' : ''}
                </div>
            )}
        </div>
    );
}
