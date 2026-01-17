import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import API from "../api";
import PlaybackController, { PlayerStates } from "../services/PlaybackController";

// --- ENTERPRISE THEME ---
const btnStyle = { background: "#444", color: "#fff", border: "none", padding: "4px 8px", borderRadius: 3, cursor: "pointer" };

const THEME = {
    bg: "#1e1e1e",
    sidebar: "#252526",
    header: "#2d2d2d",
    text: "#ffffff",
    accent: "#2196f3",
    segment: "#4caf50",
    segmentEvent: "#2196f3",
    rulerBg: "#252526",
    playhead: "#ff9800",
    panelBorder: "#3e3e42",
    selectedItem: "#37373d"
};

export default function PlaybackModern() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const camId = searchParams.get("camId");

    // --- STATE ---
    const [cameras, setCameras] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [playerState, setPlayerState] = useState(PlayerStates.IDLE);

    // --- TIMELINE STATE ---
    const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
    const [viewportStartMs, setViewportStartMs] = useState(new Date().setHours(0, 0, 0, 0));
    const [zoomPxPerSec, setZoomPxPerSec] = useState(1000 / 86400); // Fit Day Default
    const [containerWidth, setContainerWidth] = useState(1000);
    const [segments, setSegments] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    const videoRef = useRef(null);
    const playerRef = useRef(null);
    const timelineRef = useRef(null);
    const dragRef = useRef({ isDragging: false, startX: 0, startViewTime: 0 });

    const [recRange, setRecRange] = useState({ start: null, end: null });

    // --- DATA SETUP ---
    useEffect(() => {
        // Fetch Camera List
        API.get('/cameras').then(res => {
            const list = Array.isArray(res.data) ? res.data : [];
            setCameras(list);
        }).catch(console.error);
    }, []);

    // Fetch Recording Range
    useEffect(() => {
        if (!camId) return;
        API.get(`/api/playback/range/${camId}`).then(res => {
            setRecRange(res.data);
        }).catch(console.error);
    }, [camId]);

    // ... existing useEffects ...

    useEffect(() => {
        if (selectedDate) {
            const start = new Date(selectedDate).setHours(0, 0, 0, 0);
            setViewportStartMs(start);
            // Set Current Time to middle of day or Start? Start (00:00) makes sense for review.
            setCurrentTimeMs(start + 86400000 / 2); // Noon
        }
    }, [selectedDate]);

    useLayoutEffect(() => {
        if (!timelineRef.current) return;
        // ResizeObserver for robust width detection
        const ro = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
            }
        });
        ro.observe(timelineRef.current);
        // Initial set
        setContainerWidth(timelineRef.current.clientWidth || 1000);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (videoRef.current && camId) {
            playerRef.current = new PlaybackController(videoRef.current, camId, (s) => setPlayerState(s));
            return () => playerRef.current?.destroy();
        }
    }, [camId]);

    useEffect(() => {
        if (!camId || !selectedDate) return;
        const fetchData = async () => {
            setIsLoadingData(true);
            setSegments([]);
            try {
                const res = await API.get(`/api/playback/timeline-day/${camId}/${selectedDate}`);
                const data = res.data;
                const serverDayStart = data.dayStart;

                const localDayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
                let correction = 0;
                if (serverDayStart > 0) {
                    correction = localDayStart - serverDayStart;
                }

                const segs = (data.segments || []).map(s => ({
                    start: Number(s.start_ts) + correction,
                    end: Number(s.end_ts) + correction,
                    type: 'normal'
                })).sort((a, b) => a.start - b.start);

                setSegments(segs);
                if (playerRef.current) playerRef.current.loadSegments(segs);

                setViewportStartMs(localDayStart);
                if (containerWidth > 0) setZoomPxPerSec(containerWidth / 86400);

            } catch (e) { console.error(e); } finally { setIsLoadingData(false); }
        };
        fetchData();
    }, [camId, selectedDate, containerWidth]);

    // --- SYNC LOOP ---
    useEffect(() => {
        const i = setInterval(() => {
            if (playerState === PlayerStates.PLAYING && playerRef.current) {
                const now = playerRef.current.getCurrentTime();
                if (Math.abs(now - currentTimeMs) > 200) setCurrentTimeMs(now);

                // Gap Skip
                const currentSeg = segments.find(s => now >= s.start && now < s.end);
                if (currentSeg && (currentSeg.end - now) < 500) {
                    const nextSeg = segments.find(s => s.start >= currentSeg.end);
                    if (nextSeg && nextSeg.start - currentSeg.end > 1000) {
                        playerRef.current.seekTo(nextSeg.start);
                    }
                }
            }
        }, 100);
        return () => clearInterval(i);
    }, [playerState, currentTimeMs, segments]);

    // --- ACTIONS ---
    const handleCameraClick = (id) => {
        navigate(`/playback?camId=${id}`);
    };

    const performSeek = (ts) => {
        setCurrentTimeMs(ts);
        playerRef.current?.seekTo(ts);
    };

    const fitDay = () => {
        const start = new Date(selectedDate).setHours(0, 0, 0, 0);
        setViewportStartMs(start);
        setZoomPxPerSec(containerWidth / 86400);
    };

    // --- MOUSE HANDLERS (Constrained Pan) ---
    const handleMouseDown = (e) => {
        dragRef.current = { isDragging: true, startX: e.clientX, startViewTime: viewportStartMs };
    };

    const handleMouseMove = (e) => {
        if (!dragRef.current.isDragging) return;
        const dx = e.clientX - dragRef.current.startX;
        const dt = -(dx / zoomPxPerSec) * 1000;

        let newStart = dragRef.current.startViewTime + dt;

        // CONSTRAIN TO DAY BOUNDARIES (User Request: "Nu trece de la o zi la alta")
        const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
        const dayEnd = dayStart + 86400000;

        // Allow zooming but keep view within day range roughly
        // If zoomed in, we can pan. But don't pan past 00:00 or 24:00 relative to container?
        // Actually, just clamp strictly.
        if (newStart < dayStart) newStart = dayStart;
        if (newStart > dayEnd - (containerWidth / zoomPxPerSec * 1000)) {
            // newStart cannot ensure end > dayEnd completely if zoomed out?
            // If zoomed out Max (fit day), newStart is dayStart.
            // If zoomed in, restrict right edge.
            // Let's just create a soft clamp for left side 00:00
        }
        setViewportStartMs(newStart);
    };

    const handleMouseUp = (e) => {
        dragRef.current.isDragging = false;
        if (Math.abs(e.clientX - dragRef.current.startX) < 5) {
            const rect = timelineRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const ts = viewportStartMs + (clickX / zoomPxPerSec) * 1000;
            performSeek(ts);
        }
    };

    const handleWheel = (e) => {
        if (e.target.closest('.timeline-area')) {
            e.preventDefault();
            const rect = timelineRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const timeUnderMouse = viewportStartMs + (mouseX / zoomPxPerSec) * 1000;
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(containerWidth / 86400, Math.min(5.0, zoomPxPerSec * factor));

            // Calc new start to keep mouse time static
            let newStart = timeUnderMouse - (mouseX / newZoom) * 1000;

            // Constrain
            const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
            if (newStart < dayStart) newStart = dayStart;

            setZoomPxPerSec(newZoom);
            setViewportStartMs(newStart);
        }
    };

    // --- RENDER HELPERS ---
    const timeToPx = (t) => (t - viewportStartMs) / 1000 * zoomPxPerSec;

    const renderRuler = () => {
        const ticks = [];
        const stepMs = (3600 * 1000); // Fixed 1 Hour ticks for "0-24" stability
        const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);

        for (let i = 0; i <= 24; i++) {
            const t = dayStart + i * stepMs;
            const x = timeToPx(t);
            if (x < -20 || x > containerWidth) continue;
            ticks.push(
                <div key={i} style={{ position: 'absolute', left: x, top: 0, height: 25, borderLeft: '1px solid #666' }}>
                    <div style={{ position: 'absolute', top: 2, left: 4, fontSize: 11, color: '#aaa' }}>{i}:00</div>
                </div>
            );
        }
        return ticks;
    };

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', background: THEME.bg, color: THEME.text }}>

            {/* SIDEBAR - CAMERA LIST */}
            <div style={{ width: 250, background: THEME.sidebar, borderSizing: 'border-box', borderRight: `1px solid ${THEME.panelBorder}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: "12px 16px", fontWeight: 'bold', borderBottom: `1px solid ${THEME.panelBorder}`, color: THEME.accent, fontSize: 12, letterSpacing: 1 }}>CHANNELS</div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {cameras.map(cam => (
                        <div key={cam.id}
                            onClick={() => handleCameraClick(cam.id)}
                            style={{
                                padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                                borderBottom: `1px solid rgba(255,255,255,0.02)`,
                                background: camId === cam.id ? THEME.selectedItem : 'transparent',
                                color: camId === cam.id ? THEME.accent : '#aaa',
                                borderLeft: camId === cam.id ? `3px solid ${THEME.accent}` : '3px solid transparent'
                            }}>
                            {cam.name || cam.id}
                        </div>
                    ))}
                    {cameras.length === 0 && <div style={{ padding: 10, color: '#888' }}>No cameras found</div>}
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <header style={{ height: 44, background: THEME.header, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: `1px solid ${THEME.panelBorder}`, gap: 15 }}>
                    <button
                        onClick={() => navigate('/live')}
                        style={{ ...btnStyle, background: 'transparent', padding: '4px 8px', fontSize: 16 }}
                        title="Back to Live"
                    >
                        ⬅️
                    </button>
                    <span style={{ fontWeight: 'bold', color: THEME.accent, fontSize: 14 }}>ARHIVĂ VMS</span>
                    {camId && (
                        <span style={{ fontSize: 13, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>
                            {cameras.find(c => c.id === camId)?.name || camId}
                        </span>
                    )}
                    {recRange.start && (
                        <span style={{ fontSize: 11, color: '#888' }}>
                            ({new Date(recRange.start).toLocaleDateString()} - {new Date(recRange.end).toLocaleDateString()})
                        </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                        style={{ background: '#333', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
                </header>

                <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden', minHeight: 0 }}>
                    <video ref={videoRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                    {!camId && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#aaa' }}>Select a Camera</div>}
                </div>

                <div style={{ height: 48, background: '#252526', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 10 }}>
                    <button style={btnStyle} onClick={() => performSeek(currentTimeMs - 5000)}>⏪</button>
                    <button style={btnStyle} onClick={() => playerState === PlayerStates.PLAYING ? playerRef.current?.pause() : playerRef.current?.play()}>
                        {playerState === PlayerStates.PLAYING ? "PAUSE" : "PLAY"}
                    </button>
                    <button style={btnStyle} onClick={() => performSeek(currentTimeMs + 5000)}>⏩</button>
                    <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace' }}>
                        {new Date(currentTimeMs).toLocaleTimeString()}
                    </span>
                    <button style={btnStyle} onClick={fitDay}>24H</button>
                </div>

                <div className="timeline-area" ref={timelineRef}
                    style={{ height: 100, background: THEME.rulerBg, position: 'relative', overflow: 'hidden' }}
                    onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onMouseMove={handleMouseMove} onMouseDown={handleMouseDown} onWheel={handleWheel}
                >
                    <div style={{ height: 25, borderBottom: '1px solid #444' }}>{renderRuler()}</div>
                    <div style={{ position: 'relative', top: 5, height: 40 }}>
                        {segments.map((s, i) => {
                            const x = timeToPx(s.start);
                            const w = Math.max(2, (s.end - s.start) / 1000 * zoomPxPerSec);
                            if (x + w < 0 || x > containerWidth) return null;
                            return <div key={i} style={{ position: 'absolute', left: x, width: w, height: '100%', background: THEME.segment }} />
                        })}
                    </div>
                    <div style={{ position: 'absolute', left: timeToPx(currentTimeMs), top: 0, bottom: 0, width: 2, background: THEME.playhead, zIndex: 10 }} />
                </div>
            </div>
        </div>
    );
}


