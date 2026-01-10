import React, { useMemo, useState, useEffect, useRef } from 'react';

export default function Timeline({
    currentTime,
    dayStart,
    segments = [],
    onSeek
}) {
    const containerRef = useRef(null);
    const DAY_MS = 86400 * 1000;
    const MIN_ZOOM_MS = 60 * 1000; // 1 minute max resolution

    // Viewport State (Independent of playback position)
    const [viewStart, setViewStart] = useState(dayStart);
    const [viewEnd, setViewEnd] = useState(dayStart + DAY_MS);

    // Reset view when day changes
    useEffect(() => {
        setViewStart(dayStart);
        setViewEnd(dayStart + DAY_MS);
    }, [dayStart]);

    // Position Calculator (Time -> % CSS)
    const getPos = (t) => {
        const duration = viewEnd - viewStart;
        if (duration <= 0) return 0;
        return ((t - viewStart) / duration) * 100;
    };

    // Time Calculator (Mouse X -> Time)
    const getTimeFromX = (clientX) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const ratio = x / rect.width;
        return viewStart + ((viewEnd - viewStart) * ratio);
    };

    // ZOOM LOGIC (Mouse-Centered)
    const handleWheel = (e) => {
        if (!containerRef.current) return;

        // e.deltaY < 0 means Scrolling UP (Zoom IN)
        // e.deltaY > 0 means Scrolling DOWN (Zoom OUT)
        const zoomFactor = 0.2;
        const isZoomIn = e.deltaY < 0;

        const currentDuration = viewEnd - viewStart;
        let newDuration = isZoomIn
            ? Math.max(MIN_ZOOM_MS, currentDuration * (1 - zoomFactor))
            : Math.min(DAY_MS, currentDuration * (1 + zoomFactor));

        // Calculate focus point (where the mouse is)
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseRatio = Math.max(0, Math.min(1, mouseX / rect.width));
        const mouseTime = viewStart + (currentDuration * mouseRatio);

        // New start/end to keep mouseTime stationary
        let newStart = mouseTime - (newDuration * mouseRatio);
        let newEnd = newStart + newDuration;

        // Clamp to Day Bounds (00:00 - 24:00)
        if (newStart < dayStart) {
            newStart = dayStart;
            newEnd = newStart + newDuration;
        }
        if (newEnd > dayStart + DAY_MS) {
            newEnd = dayStart + DAY_MS;
            newStart = newEnd - newDuration;
            // Handle case where zoom out > day
            if (newStart < dayStart) newStart = dayStart;
        }

        setViewStart(newStart);
        setViewEnd(newEnd);
    };

    // SEEK LOGIC (Click)
    const handleMouseDown = (e) => {
        // Simple click-to-seek
        const t = getTimeFromX(e.clientX);
        onSeek(Math.max(dayStart, Math.min(dayStart + DAY_MS, t)));
    };

    // MARKERS GENERATION
    const markers = useMemo(() => {
        const arr = [];
        const totalDuration = viewEnd - viewStart;
        if (totalDuration <= 0) return [];

        // Dynamic Granularity
        let step = 3600000; // 1h default
        let subStep = 900000; // 15m

        if (totalDuration <= 3600000) { // 1h view -> 5m/1m steps
            step = 300000; // 5m
            subStep = 60000; // 1m
        } else if (totalDuration <= 14400000) { // 4h view -> 30m/5m steps
            step = 1800000; // 30m
            subStep = 300000; // 5m
        }

        // Align to clean step boundaries
        const firstMark = Math.floor(viewStart / subStep) * subStep;

        for (let t = firstMark; t <= viewEnd; t += subStep) {
            if (t < viewStart) continue; // Optimization

            const isMain = (t % step === 0);
            const left = getPos(t);

            // Format Label
            const d = new Date(t);
            const h = d.getHours().toString().padStart(2, '0');
            const m = d.getMinutes().toString().padStart(2, '0');
            let label = `${h}:${m}`;

            arr.push({ time: t, label, isMain, left });
        }
        return arr;
    }, [viewStart, viewEnd]);

    const curPos = getPos(currentTime);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative', width: '100%', height: '100%',
                background: '#222', overflow: 'hidden',
                borderTop: '1px solid #444',
                cursor: 'pointer',
                userSelect: 'none'
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
        >
            {/* Markers */}
            {markers.map(m => (
                <div key={m.time} style={{
                    position: 'absolute', left: `${m.left}%`,
                    bottom: 0, top: m.isMain ? 0 : '65%',
                    width: 1, background: m.isMain ? '#666' : '#333',
                    pointerEvents: 'none'
                }}>
                    {m.isMain && (
                        <span style={{
                            position: 'absolute', top: 2, left: 3,
                            fontSize: 10, color: '#aaa',
                            borderLeft: '1px solid #666', paddingLeft: 2
                        }}>
                            {m.label}
                        </span>
                    )}
                </div>
            ))}

            {/* Segments (Green Regions) */}
            <div style={{ position: 'absolute', top: 30, bottom: 0, width: '100%', pointerEvents: 'none' }}>
                {segments.map((s, i) => {
                    // Culling
                    if (s.end < viewStart || s.start > viewEnd) return null;
                    const l = Math.max(0, getPos(s.start));
                    const r = Math.min(100, getPos(s.end));
                    return (
                        <div key={i} style={{
                            position: 'absolute', left: `${l}%`, width: `${r - l}%`,
                            height: '100%', background: '#4CAF50', opacity: 0.6,
                            borderLeft: '1px solid #66BB6A', borderRight: '1px solid #66BB6A'
                        }} />
                    );
                })}
            </div>

            {/* Playhead (Red Line) */}
            {curPos >= 0 && curPos <= 100 && (
                <div style={{
                    position: 'absolute', left: `${curPos}%`, top: 0, bottom: 0,
                    width: 2, background: '#FF5252', zIndex: 100,
                    boxShadow: '0 0 4px red',
                    pointerEvents: 'none'
                }}>
                    <div style={{
                        position: 'absolute', bottom: 2, left: 4,
                        background: 'rgba(255, 82, 82, 0.9)', color: '#fff',
                        fontSize: 10, padding: '1px 3px', borderRadius: 2
                    }}>
                        {new Date(currentTime).toLocaleTimeString()}
                    </div>
                </div>
            )}
        </div>
    );
}
