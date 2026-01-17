import React, { useEffect, useRef } from 'react';

export default function RecorderPlayer({ camId, hlsUrl: propHlsUrl, style }) {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const hlsUrl = propHlsUrl || `/api/playback/live/${camId}.m3u8`;

        const initHls = () => {
            if (window.Hls && window.Hls.isSupported()) {
                if (hlsRef.current) hlsRef.current.destroy();

                const hls = new window.Hls({
                    debug: false,
                    enableWorker: true,
                    manifestLoadingTimeOut: 10000,
                });

                hls.loadSource(hlsUrl);
                hls.attachMedia(video);

                hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    console.log('[RecorderPlayer] Manifest parsed');
                    video.play().catch(e => console.warn("Autoplay blocked", e));
                });

                hls.on(window.Hls.Events.MANIFEST_LOADED, (event, data) => {
                    console.log('[RecorderPlayer] Manifest loaded, live:', data.details.live);
                });

                hls.on(window.Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('[RecorderPlayer] Fatal error:', data.type, data.details);
                        switch (data.type) {
                            case window.Hls.ErrorTypes.NETWORK_ERROR:
                                console.log('[RecorderPlayer] Recovering from network error...');
                                setTimeout(() => hls.startLoad(), 1000);
                                break;
                            case window.Hls.ErrorTypes.MEDIA_ERROR:
                                console.log('[RecorderPlayer] Recovering from media error...');
                                hls.recoverMediaError();
                                break;
                            default:
                                console.error('[RecorderPlayer] Unrecoverable error');
                                hls.destroy();
                                break;
                        }
                    }
                });

                hlsRef.current = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = hlsUrl;
                video.addEventListener('loadedmetadata', () => video.play());
            }
        };

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
    }, [camId]);

    return (
        <div style={{ ...style, position: 'relative', background: '#000', overflow: 'hidden' }}>
            <video
                ref={videoRef}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block'
                }}
                autoPlay
                muted
                playsInline
            />
        </div>
    );
}
