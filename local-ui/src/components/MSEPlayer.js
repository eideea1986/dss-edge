import React, { useEffect, useRef, useState } from 'react';

function MSEPlayer({ camId, streamType = 'hd', style, onClick, onDoubleClick, isHidden }) {
    const videoRef = useRef(null);
    const wsRef = useRef(null);
    const [status, setStatus] = useState("init");
    const [errorMsg, setErrorMsg] = useState(null);

    const suffix = streamType === 'low' ? 'sub' : streamType === 'hd' ? 'hd' : streamType;
    const streamName = `${camId}_${suffix}`;

    useEffect(() => {
        if (isHidden) return;

        let isMounted = true;
        setStatus("analyzing");
        setErrorMsg(null);

        const video = videoRef.current;
        if (!video) return;

        const cleanup = () => {
            isMounted = false;
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (video.src) {
                URL.revokeObjectURL(video.src);
                video.src = '';
            }
        };

        const startMse = async () => {
            try {
                // 1. Detect Codec via Go2RTC API
                const infoRes = await fetch(`/rtc/api/streams?src=${streamName}`);
                if (!infoRes.ok) throw new Error("Stream info fetch failed");
                const infoData = await infoRes.json();

                // Parse codec from Go2RTC response
                // Structure: { "streams": { "streamName": { "producers": [ { "medias": [ "video, recvonly, H264..." ] } ] } } }
                // OR simplified json depending on version. Let's look for known patterns.

                let detectedCodec = 'avc1.64001E'; // Default H264 High
                let codecType = 'h264';

                // Robust Search in JSON
                const jsonStr = JSON.stringify(infoData);
                if (jsonStr.includes("H265") || jsonStr.includes("HEVC")) {
                    detectedCodec = 'hvc1.1.6.L93.B0'; // Generic H265
                    codecType = 'h265';
                } else if (jsonStr.includes("H264")) {
                    detectedCodec = 'avc1.64001E';
                    codecType = 'h264';
                }

                console.log(`[MSE] Detected Codec for ${streamName}: ${codecType} (${detectedCodec})`);

                const mime = `video/mp4; codecs="${detectedCodec}"`;
                if (!MediaSource.isTypeSupported(mime)) {
                    throw new Error(`Browser does not support ${codecType} (${detectedCodec})`);
                }

                // 2. Initialize MSE
                const mse = new MediaSource();
                video.src = URL.createObjectURL(mse);

                mse.addEventListener('sourceopen', () => {
                    if (!isMounted) return;

                    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    const wsUrl = `${proto}//${window.location.host}/rtc/api/ws?src=${streamName}`;

                    const ws = new WebSocket(wsUrl);
                    ws.binaryType = 'arraybuffer';
                    wsRef.current = ws;

                    ws.onopen = () => setStatus("playing");
                    ws.onclose = () => {
                        if (isMounted) setStatus("disconnected");
                    };
                    ws.onerror = (e) => console.error("[MSE] WS Error", e);

                    let sb = null;
                    const queue = [];

                    const processQueue = () => {
                        if (sb && !sb.updating && queue.length > 0) {
                            try {
                                sb.appendBuffer(queue.shift());
                            } catch (e) {
                                console.error("[MSE] Append Error", e);
                            }
                        }
                    };

                    ws.onmessage = (event) => {
                        const data = event.data;
                        if (!sb && mse.readyState === 'open') {
                            try {
                                sb = mse.addSourceBuffer(mime);
                                sb.mode = 'segments';
                                sb.addEventListener('updateend', processQueue);
                            } catch (e) {
                                console.error("[MSE] SourceBuffer Error", e);
                                ws.close();
                            }
                        }
                        if (sb) {
                            queue.push(data);
                            processQueue();
                        }
                    };
                });

            } catch (e) {
                console.error("[MSE] Init Error:", e);
                if (isMounted) {
                    setStatus("error");
                    setErrorMsg(e.message);
                }
            }
        };

        startMse();

        // Auto-play watchdog
        const interval = setInterval(() => {
            if (video.paused && status === 'playing') video.play().catch(() => { });
        }, 2000);

        return () => {
            clearInterval(interval);
            cleanup();
        };
    }, [camId, suffix, isHidden, streamName]);

    return (
        <div className="mse-player" style={{ ...style, position: "relative", background: "#000", width: "100%", height: "100%", overflow: "hidden" }}
            onClick={onClick} onDoubleClick={onDoubleClick}>
            <video
                ref={videoRef}
                style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
                playsInline muted autoPlay
            />

            {/* STATUS OVERLAY */}
            {(status !== 'playing' || errorMsg) && (
                <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.6)", color: "#fff", zIndex: 10
                }}>
                    {status === 'analyzing' && <div style={{ fontSize: 12 }}>Analyzing Stream...</div>}
                    {status === 'connecting' && <div style={{ fontSize: 12 }}>Connecting TCP...</div>}
                    {status === 'error' && (
                        <div style={{ textAlign: "center", padding: 20 }}>
                            <div style={{ color: "#ff4444", fontWeight: "bold", marginBottom: 5 }}>Playback Error</div>
                            <div style={{ fontSize: 11, color: "#ccc" }}>{errorMsg}</div>
                            {errorMsg && errorMsg.includes("H265") && (
                                <div style={{ fontSize: 10, marginTop: 10, fontStyle: "italic", color: "#aaa" }}>
                                    Try native app or switch camera to H.264
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default React.memo(MSEPlayer);
