import React, { useEffect, useRef, useState } from 'react';
import { baseURL } from '../api';
// JMuxer loaded via script tag in index.html to avoid webpack polyfill issues
const JMuxer = window.JMuxer;

export default function MSEPlayer({ camId, style, onClick, onDoubleClick }) {
    const videoRef = useRef(null);
    const jmuxerRef = useRef(null);
    const wsRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!camId || !videoRef.current) return;

        // Cleanup previous
        if (wsRef.current) {
            wsRef.current.close();
        }
        if (jmuxerRef.current) {
            try { jmuxerRef.current.destroy(); } catch (e) { }
        }

        // Calculate WebSocket URL
        // baseURL example: "http://194.107.163.227:8091/api/proxy/LOC005"
        // Target: "ws://194.107.163.227:8091/api/proxy/LOC005/ws/stream/camId"

        let wsBase = baseURL;
        if (!wsBase && typeof window !== 'undefined') {
            const match = window.location.href.match(/(\/api\/proxy\/[^\/]+)/);
            if (match) wsBase = window.location.origin + match[1];
            else if (window.location.hash.includes("#/")) {
                // Local dev fallback
                wsBase = window.location.origin;
            }
        }

        // Handle protocol
        if (wsBase.startsWith('https')) {
            wsBase = wsBase.replace('https', 'wss');
        } else if (wsBase.startsWith('http')) {
            wsBase = wsBase.replace('http', 'ws');
        }

        const wsUrl = `${wsBase}/ws/stream/${camId}`;
        console.log(`[MSE] Connecting to ${wsUrl}`);

        try {
            // Initialize JMuxer
            jmuxerRef.current = new JMuxer({
                node: videoRef.current,
                mode: 'video', // video only for now
                flushingTime: 0, // low latency
                clearBuffer: true,
                fps: 25,
                debug: false,
                onError: (e) => {
                    console.error("[MSE] JMuxer error", e);
                    // Do not set global error to allow auto-recovery if new data comes
                }
            });

            // Initialize WebSocket
            const ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                console.log(`[MSE] Connected ${camId}`);
                setError(null);
            };

            ws.onmessage = (event) => {
                if (jmuxerRef.current) {
                    try {
                        jmuxerRef.current.feed({
                            video: new Uint8Array(event.data)
                        });
                    } catch (e) {
                        // ignore buffer errors
                    }
                }
            };

            ws.onclose = () => {
                // console.log(`[MSE] Closed ${camId}`);
            };

            ws.onerror = (e) => {
                console.error(`[MSE] WS Error ${camId}`, e);
                setError("Stream Error");
            };

            wsRef.current = ws;

        } catch (err) {
            console.error("[MSE] Setup failed", err);
            setError("Setup Failed");
        }

        return () => {
            if (wsRef.current) wsRef.current.close();
            if (jmuxerRef.current) {
                try { jmuxerRef.current.destroy(); } catch (e) { }
            }
        };
    }, [camId]);

    return (
        <div
            style={{ ...style, background: '#000', position: 'relative' }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
        >
            <video
                ref={videoRef}
                style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                autoPlay
                muted
                playsInline
            />
            {error && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#f44336', background: 'rgba(0,0,0,0.7)',
                    fontSize: 12
                }}>
                    {error}
                </div>
            )}
        </div>
    );
}
