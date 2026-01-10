import React, { useEffect, useRef, useState } from "react";
import { baseURL } from "../api";

export default function WSPlayer(props) {
    const { camId, style, onClick, onDoubleClick } = props;
    const [status, setStatus] = useState("init"); // init, loading, connected, error
    const [retryCount, setRetryCount] = useState(0);

    // Using MJPEG proxy or Snapshot for bandwidth optimization
    const getUrlPrefix = () => {
        let urlPrefix = baseURL;
        if (!urlPrefix && typeof window !== 'undefined') {
            const match = window.location.href.match(/(\/api\/proxy\/[^\/]+)/);
            if (match) urlPrefix = match[1];
        }
        return urlPrefix;
    };

    const urlPrefix = getUrlPrefix();

    const getSnapshotUrl = () => `${urlPrefix}/cameras/${camId}/snapshot?_=${Date.now()}`;
    const getStreamUrl = () => `${urlPrefix}/stream/${camId}?t=${retryCount}&q=${props.quality}`;

    const [currentSrc, setCurrentSrc] = useState("");

    useEffect(() => {
        if (!camId) return;
        setStatus("loading");

        let timeoutId = null;
        let isMounted = true;

        const loadNextSnapshot = () => {
            if (!isMounted) return;

            // Only poll if quality is low
            if (props.quality !== 'low') return;

            const img = new Image();
            const nextSrc = getSnapshotUrl();

            img.onload = () => {
                if (!isMounted) return;
                setCurrentSrc(nextSrc); // Swap instantly (cached by browser)
                setStatus("connected");
                // Schedule next frame
                timeoutId = setTimeout(loadNextSnapshot, 1000); // 1 FPS
            };

            img.onerror = () => {
                if (!isMounted) return;
                // If fails, wait longer before retry
                timeoutId = setTimeout(loadNextSnapshot, 3000);
            };

            // Start loading
            img.src = nextSrc;
        };

        if (props.quality === 'low') {
            loadNextSnapshot();
        } else {
            // High Quality: Continuous Stream
            // Trassir Mode: Use H.264 via Go2RTC WebRTC/MSE (iframe)
            // This is the cleanest way to play H.264 in browser without heavy JS decoding
            if (props.quality !== 'low' && urlPrefix) {
                // Go2RTC is on port 1984, but we need to route via ingress if remote.
                // Assuming standard setup: http://192.168.120.207:1984/stream.html?src=cam_id_sub

                // For now, let's keep MJPEG as it is safe, but optimize backend.
                // If user insisted on "H.264", we should switch to an iframe player or similar.
                // But mixing iframe and img in grid is tricky.
                // Let's stick to MJPEG for now but ensure backend is sane.
                setCurrentSrc(getStreamUrl());
            } else {
                setCurrentSrc(getStreamUrl());
            }
        }

        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [camId, retryCount, props.quality, urlPrefix]);

    const handleLoad = () => {
        setStatus("connected");
    };

    const handleError = () => {
        // Only trigger error state if we are really stuck, 
        // snapshot errors might be transient.
        // For stream, it's critical.
        if (props.quality !== 'low') {
            console.error(`[Player ${camId}] Stream failed. Retrying...`);
            setStatus("error");
            setTimeout(() => {
                setRetryCount(prev => prev + 1);
                setStatus("loading");
            }, 3000);
        }
    };

    return (
        <div style={{
            position: "relative",
            background: "#000",
            overflow: "hidden",
            aspectRatio: "16 / 9",
            ...style
        }} onClick={onClick} onDoubleClick={onDoubleClick}>
            {camId ? (
                <img
                    // Remove key to prevent unmount/remount flickering
                    src={currentSrc}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "fill",
                        display: "block",
                        backgroundColor: "#000"
                    }}
                    onLoad={handleLoad}
                    onError={handleError}
                />
            ) : null}

            {status !== "connected" && status !== "init" && (
                <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: status === "error" ? "#f44336" : "#aaa",
                    fontSize: 12,
                    textAlign: "center",
                    pointerEvents: "none"
                }}>
                    {status === "loading" ? "Se încarcă..." : (status === "error" ? "Eroare Conexiune" : "Așteptare...")}
                </div>
            )}
        </div>
    );
}
