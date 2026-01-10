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

    useEffect(() => {
        if (useMjpeg) return;

        // Correct suffix based on Go2RTCService naming convention (_sub vs _hd)
        const suffix = activeStreamType === 'hd' ? '_hd' : '_sub';
        const streamName = `${camId}${suffix}`;

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
    }, [camId, activeStreamType, useMjpeg]);

    return (
        <div style={{ ...style, position: "relative", background: "#000", overflow: "hidden" }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
        >
            {useMjpeg ? (
                <img
                    src={`/rtc/api/stream.mjpeg?src=${camId}_sub`}
                    onError={(e) => {
                        // If sub mjpeg fails, try main
                        if (!e.target.src.includes('_hd')) e.target.src = `/rtc/api/stream.mjpeg?src=${camId}_hd`;
                    }}
                    style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
                    alt="Live Stream"
                />
            ) : (
                <video
                    ref={videoRef}
                    style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
                    playsInline
                    muted
                    autoPlay
                />
            )}

            {status !== 'playing' && status !== 'init' && !useMjpeg && (
                <div style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "rgba(255,255,255,0.5)", fontSize: 12, pointerEvents: "none"
                }}>
                    {status === 'connecting' ? 'Connecting...' : ''}
                </div>
            )}
        </div>
    );
}
