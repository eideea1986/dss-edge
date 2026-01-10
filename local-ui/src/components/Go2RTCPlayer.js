import React, { useEffect, useRef, useState } from 'react';

export default function Go2RTCPlayer({ camId, streamType = 'hd', style, onClick, onDoubleClick, isHidden }) {
    const videoRef = useRef(null);
    const pcRef = useRef(null);
    const [status, setStatus] = useState("init");
    const [activeStreamType, setActiveStreamType] = useState(streamType);

    useEffect(() => {
        setActiveStreamType(streamType);
    }, [streamType]);

    const suffix = activeStreamType === 'low' ? 'sub' : activeStreamType;
    const streamName = `${camId}_${suffix}`;

    useEffect(() => {
        if (isHidden) return;

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
                    videoRef.current.play().catch(() => { });
                    setStatus("playing");
                }
            };

            pc.addTransceiver('video', { direction: 'recvonly' });

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const apiUrl = `/rtc/api/webrtc?src=${streamName}`;
                const res = await fetch(apiUrl, { method: 'POST', body: pc.localDescription.sdp });

                if (!res.ok) throw new Error(`Status ${res.status}`);

                const answerSdp = await res.text();
                if (pcRef.current && pcRef.current.signalingState !== 'closed') {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
                }
            } catch (e) {
                console.warn(`[WebRTC] Failed ${streamName}:`, e.message);
                if (activeStreamType === 'low' || activeStreamType === 'sub') {
                    setActiveStreamType('hd');
                } else {
                    setStatus("failed");
                }
            }
        };

        if (camId) connectWebRTC();

        return () => {
            if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
        };
    }, [camId, activeStreamType, streamName, isHidden]);

    return (
        <div className="rtc-player" style={{ ...style, position: "relative", background: "#000", width: "100%", height: "100%", overflow: "hidden" }}
            onClick={onClick} onDoubleClick={onDoubleClick}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                <video
                    className="rtc-player-el"
                    ref={videoRef}
                    style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
                    playsInline muted autoPlay
                />
            </div>
            {status === 'connecting' && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 10, zIndex: 2 }}>
                    Connecting...
                </div>
            )}
        </div>
    );
}
