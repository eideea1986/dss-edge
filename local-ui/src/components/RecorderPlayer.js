import React, { useEffect, useRef, useState } from 'react';
import { API } from '../api';
// We assume Hls is available via window.Hls or installed. 
// Since we don't have package.json control easily, we'll try to use window.Hls if loaded from CDN, 
// or import it if the environment supports it. The previous code used a CDN script injection fallback.
// Let's stick to the previous robust pattern but simpler.

export default function RecorderPlayer({ camId, streamType, style }) {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const [hlsUrl, setHlsUrl] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    // 1. Fetch HLS URL
    useEffect(() => {
        setLoading(true);
        setError(null);
        const mode = streamType === 'hd' ? 'main' : 'sub';

        API.get(`/recorder/live-url/${camId}/${mode}`)
            .then(res => {
                // Determine full URL
                let url = res.data.url;
                if (url.startsWith("/")) url = API.defaults.baseURL + url;
                setHlsUrl(url);
            })
            .catch(e => {
                setError("Nu există flux live.");
                setLoading(false);
            });
    }, [camId, streamType]);

    // 2. Init Player
    useEffect(() => {
        if (!hlsUrl) return;

        const video = videoRef.current;

        const initHls = () => {
            if (window.Hls && window.Hls.isSupported()) {
                if (hlsRef.current) hlsRef.current.destroy();

                const hls = new window.Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });

                hls.loadSource(hlsUrl);
                hls.attachMedia(video);

                hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(e => console.warn("Autoplay block", e));
                    setLoading(false);
                });

                hls.on(window.Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case window.Hls.ErrorTypes.NETWORK_ERROR:
                                hls.startLoad();
                                break;
                            case window.Hls.ErrorTypes.MEDIA_ERROR:
                                hls.recoverMediaError();
                                break;
                            default:
                                hls.destroy();
                                break;
                        }
                    }
                });

                hlsRef.current = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // iOS / Safari
                video.src = hlsUrl;
                video.addEventListener('loadedmetadata', () => {
                    video.play();
                    setLoading(false);
                });
            }
        };

        // Load Lib if missing
        if (!window.Hls && typeof Hls === 'undefined') {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.4.0/dist/hls.min.js";
            script.onload = initHls;
            document.head.appendChild(script);
        } else {
            initHls();
        }

        return () => {
            if (hlsRef.current) hlsRef.current.destroy();
        };
    }, [hlsUrl]);

    return (
        <div style={{ ...style, position: 'relative', background: '#000', overflow: 'hidden' }}>
            <video
                ref={videoRef}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                autoPlay
                muted
                playsInline
            />
            {(loading || !hlsUrl) && !error && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(0,0,0,0.5)' }}>
                    <div className="spinner">Live Buffer...</div>
                </div>
            )}
            {error && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff5555' }}>
                    {error}
                </div>
            )}
        </div>
    );
}
