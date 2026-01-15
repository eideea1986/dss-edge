import React, { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import API from "../api";
import PlaybackCoreV2 from "../services/PlaybackCoreV2";

export default function PlaybackModern() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const camId = searchParams.get("camId");

    // --- STATE ---
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [segments, setSegments] = useState([]);

    // 1. Where are we in the video? (The Red Line)
    const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

    // 2. What part of the day are we looking at? (The Left Edge of the Timeline)
    const [viewStartMs, setViewStartMs] = useState(new Date().setHours(0, 0, 0, 0));

    // 3. How zoomed in are we? (Pixels per Second)
    const [zoomPxPerSec, setZoomPxPerSec] = useState(0.015); // Start zoomed out (approx full day)

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [containerWidth, setContainerWidth] = useState(1000);

    const videoRef = useRef(null);
    const coreRef = useRef(null);
    const timelineContainerRef = useRef(null);
    const dragRef = useRef({ isDragging: false, startX: 0, startViewTime: 0 });

    const dayStartMs = new Date(selectedDate).setHours(0, 0, 0, 0);
    const dayEndMs = dayStartMs + 86400000;

    // --- 1. LOAD DATA ---
    useEffect(() => {
        if (!camId || !selectedDate) return;

        const load = async () => {
            setIsLoading(true);
            try {
                const res = await API.get(`playback/timeline-day/${camId}/${selectedDate}`);
                const data = res.data;
                const segs = (data.segments || []).map(s => ({
                    ...s,
                    start_ts: Number(s.start_ts),
                    end_ts: Number(s.end_ts)
                }));
                setSegments(segs);

                // Auto-fit to Day initially
                if (containerWidth > 0) {
                    const ds = new Date(selectedDate).setHours(0, 0, 0, 0);
                    setViewStartMs(ds);
                    setZoomPxPerSec(containerWidth / 86400);
                }

            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [camId, selectedDate, containerWidth]);

    // --- 2. PLAYER CORE ---
    useEffect(() => {
        if (videoRef.current && camId) {
            coreRef.current = new PlaybackCoreV2(videoRef.current, camId);
        }
        return () => coreRef.current?.destroy();
    }, [camId]);

    useEffect(() => {
        if (coreRef.current && segments.length > 0) {
            coreRef.current.setSegments(segments.map(s => ({
                startTs: s.start_ts,
                endTs: s.end_ts,
                file: s.file
            })));
        }
    }, [segments]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (isPlaying && coreRef.current) {
                const epoch = coreRef.current.getCurrentEpochMs();
                if (epoch && Math.abs(epoch - currentTimeMs) > 200) {
                    setCurrentTimeMs(epoch);
                }
            }
        }, 50);
        return () => clearInterval(interval);
    }, [isPlaying, currentTimeMs]);

    const performSeek = (epoch) => {
        setCurrentTimeMs(epoch);
        if (coreRef.current) {
            coreRef.current.seekTo(epoch);
            if (!isPlaying) {
                videoRef.current.play().catch(() => { });
                setIsPlaying(true);
            }
        }
    };

    // --- 3. INTERACTION ---

    useEffect(() => {
        const handleResize = () => {
            if (timelineContainerRef.current) {
                const w = timelineContainerRef.current.clientWidth;
                setContainerWidth(w);
                if (zoomPxPerSec < 0.1) setZoomPxPerSec(w / 86400);
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleWheel = (e) => {
        e.preventDefault();

        // 1. Get Mouse Position rel to Timeline
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        // 2. Calculate Time at Mouse Cursor (Pre-Zoom)
        const mouseTime = viewStartMs + ((mouseX / zoomPxPerSec) * 1000);

        // 3. Apply Zoom
        const delta = e.deltaY > 0 ? 0.9 : 1.1; // Out : In
        const newZoom = Math.max(containerWidth / 86400, Math.min(200, zoomPxPerSec * delta));
        setZoomPxPerSec(newZoom);

        // 4. Adjust ViewStart so MouseTime stays at MouseX
        const newViewStart = mouseTime - ((mouseX / newZoom) * 1000);
        setViewStartMs(newViewStart);
    };

    const handleMouseDown = (e) => {
        dragRef.current = { isDragging: true, startX: e.clientX, startViewTime: viewStartMs };
        document.body.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e) => {
        if (!dragRef.current.isDragging) return;
        const diffPx = dragRef.current.startX - e.clientX;
        const dtMs = (diffPx / zoomPxPerSec) * 1000;
        setViewStartMs(dragRef.current.startViewTime + dtMs);
    };

    const handleMouseUp = (e) => {
        if (dragRef.current.isDragging) {
            dragRef.current.isDragging = false;
            document.body.style.cursor = 'default';

            const dist = Math.abs(e.clientX - dragRef.current.startX);
            if (dist < 5) {
                const rect = timelineContainerRef.current.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickTime = viewStartMs + ((clickX / zoomPxPerSec) * 1000);
                performSeek(clickTime);
            }
        }
    };

    // --- 4. RENDER V3 (TRASSIR STYLE) ---
    // Colors
    // BG: #222
    // Track: #1a1a1a
    // Grid: #444
    // Segments: #2ea043
    // Playhead: #ff3333

    const timeToPx = (ts) => ((ts - viewStartMs) / 1000) * zoomPxPerSec;

    const renderGrid = () => {
        const ticks = [];
        const startMs = viewStartMs;
        const endMs = viewStartMs + (containerWidth / zoomPxPerSec * 1000);

        // Determine Scale and Steps
        // Strategy: We want ticks every ~100px
        const targetTickPx = 100;
        const secondsPer100Px = targetTickPx / zoomPxPerSec;

        // Available steps (seconds)
        const steps = [1, 5, 10, 30, 60, 300, 600, 1800, 3600, 7200, 14400];
        let stepSec = 3600;

        // Find best fit step (smallest step > target)
        for (let s of steps) {
            if (s >= secondsPer100Px) {
                stepSec = s;
                break;
            }
        }

        const stepMs = stepSec * 1000;
        const firstTick = Math.floor(startMs / stepMs) * stepMs;

        for (let t = firstTick; t < endMs; t += stepMs) {
            const x = timeToPx(t);
            const d = new Date(t);

            // Format Label based on granularity
            let label = "";
            let isMajor = false;

            if (stepSec >= 3600) {
                // Hour View (00:00)
                label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                isMajor = true;
            } else if (stepSec >= 60) {
                // Minute View (00:30)
                label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                if (d.getMinutes() === 0) isMajor = true;
            } else {
                // Second View (00:00:15)
                label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                if (d.getSeconds() === 0) isMajor = true;
            }

            // Render Tick Line
            ticks.push(
                <div key={`tick-${t}`} style={{
                    position: 'absolute',
                    left: x,
                    top: 0,
                    bottom: 0,
                    borderLeft: isMajor ? '1px solid #666' : '1px solid #333',
                    pointerEvents: 'none'
                }}>
                    {/* Timestamp Label */}
                    <div style={{
                        position: 'absolute',
                        bottom: 2,
                        left: 4,
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: isMajor ? '#fff' : '#888'
                    }}>
                        {label}
                    </div>
                </div>
            );
        }
        return ticks;
    };

    const renderSegments = () => {
        const endVis = viewStartMs + (containerWidth / zoomPxPerSec * 1000);
        return segments.map((s, i) => {
            if (s.end_ts < viewStartMs || s.start_ts > endVis) return null;

            const x1 = timeToPx(s.start_ts);
            const durationSec = (s.end_ts - s.start_ts) / 1000;
            const w = Math.max(1, durationSec * zoomPxPerSec);

            return (
                <div key={i} style={{
                    position: 'absolute',
                    left: x1,
                    top: 10, // Slightly padded from top
                    bottom: 20, // Leave room for time text
                    width: w,
                    background: 'linear-gradient(180deg, #2ecc71 0%, #27ae60 100%)', // Gradient Green
                    opacity: 0.9,
                    border: '1px solid #1e8449',
                    borderRadius: 1,
                    pointerEvents: 'none'
                }} />
            );
        });
    };

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            background: "var(--bg-dark)",
            color: "var(--text-primary)",
            userSelect: "none",
            fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", sans-serif'
        }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseMove={handleMouseMove}
        >
            {/* TOOLBAR */}
            <div style={{
                height: 48,
                background: "#1f1f1f",
                borderBottom: "1px solid #333",
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
                gap: 16,
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
            }}>
                <button onClick={() => navigate("/")} style={{
                    background: "#333", border: "1px solid #444", borderRadius: 4,
                    color: "#fff", height: 32, padding: "0 12px", cursor: "pointer", fontWeight: 600
                }}>
                    ← LIVE
                </button>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>PLAYBACK ARCHIVE</div>

                <div style={{ flex: 1 }} />

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 10, color: '#888' }}>CURRENT TIME</div>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: '#2ecc71', fontFamily: 'monospace' }}>
                        {new Date(currentTimeMs).toLocaleTimeString()}
                    </div>
                </div>

                <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    style={{
                        background: '#111', color: '#fff', border: '1px solid #444',
                        padding: '4px 8px', borderRadius: 4, fontFamily: 'inherit'
                    }}
                />
            </div>

            {/* VIDEO PLAYER */}
            <div style={{ flex: 1, background: "#000", position: 'relative' }}>
                <video ref={videoRef} style={{ width: '100%', height: '100%' }} onClick={() => {
                    if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
                    else { videoRef.current.play(); setIsPlaying(true); }
                }} />

                {/* Overlay Play Button */}
                {!isPlaying && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 64, height: 64,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
                    }}>
                        <div style={{
                            width: 0, height: 0,
                            borderTop: '15px solid transparent',
                            borderBottom: '15px solid transparent',
                            borderLeft: '25px solid white',
                            marginLeft: 4
                        }} />
                    </div>
                )}
            </div>

            {/* TIMELINE AREA */}
            <div
                ref={timelineContainerRef}
                style={{
                    height: 90,
                    background: "#1a1a1a",
                    borderTop: "1px solid #333",
                    position: "relative",
                    overflow: "hidden",
                    cursor: dragRef.current.isDragging ? "grabbing" : "default"
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
            >
                {/* Track Background */}
                <div style={{ position: 'absolute', top: 10, bottom: 20, left: 0, right: 0, background: '#111', borderTop: '1px solid #333', borderBottom: '1px solid #333' }} />

                {/* Grid & Segments */}
                {renderGrid()}
                {renderSegments()}

                {/* PLAYHEAD (Red Line) */}
                <div style={{
                    position: "absolute",
                    left: timeToPx(currentTimeMs),
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: "#ff3333", // Bright Red/Orange
                    boxShadow: "0 0 4px rgba(255, 51, 51, 0.4)",
                    transform: "translateX(-1px)",
                    zIndex: 20,
                    pointerEvents: "none"
                }}>
                    {/* Triangle Top */}
                    <div style={{
                        position: 'absolute', top: 0, left: -6,
                        width: 0, height: 0,
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderTop: '8px solid #ff3333'
                    }} />
                </div>
            </div>
        </div>
    );
}
