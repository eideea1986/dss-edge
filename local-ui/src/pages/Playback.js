import React, { useEffect, useRef, useState, useCallback } from 'react';
import API from '../api';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;

const Playback = () => {
    // 0. URL PARAMS
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const initCam = urlParams.get('camId');

    // STATE
    const [cameras, setCameras] = useState([]);
    const [camId, setCamId] = useState(initCam || '');
    const [timelineSegments, setTimelineSegments] = useState([]);
    const [serverDayStart, setServerDayStart] = useState(0);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [stats, setStats] = useState({ first: null, last: null });

    // TIMELINE UI STATE
    const [zoom, setZoom] = useState(1); // 1 = 24h visible
    const [offsetMs, setOffsetMs] = useState(0); // Offset in ms from dayStart
    const [playheadMs, setPlayheadMs] = useState(null); // Relative to dayStart
    const [seekInfo, setSeekInfo] = useState(null); // For displaying "Seeking to: ..."

    // REFS
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const lastSeekBaseTs = useRef(0); // Store start_ts of the segment we seeked to

    // 1. LOAD CAMERAS
    useEffect(() => {
        API.get('/cameras').then(res => {
            setCameras(res.data);
            if (!camId && res.data.length > 0) setCamId(res.data[0].id);
        }).catch(err => console.error("Cameras load error", err));
    }, [camId]);

    // 1.5. LOAD STATS
    useEffect(() => {
        if (!camId) return;
        API.get(`/playback/stats/${camId}?_t=${Date.now()}`)
            .then(res => setStats(res.data))
            .catch(console.error);
    }, [camId]);

    // 2. LOAD SEGMENTS
    useEffect(() => {
        if (!camId) return;
        API.get(`/playback/timeline-day/${camId}/${selectedDate}?_ts=${Date.now()}`)
            .then(res => {
                const { segments, dayStart } = res.data;
                setServerDayStart(dayStart);
                setTimelineSegments(segments || []);
                // Reset timeline on date change
                setOffsetMs(0);
                setZoom(1);
            })
            .catch(err => console.error("Timeline error", err));
    }, [camId, selectedDate]);

    // 3. UTILS FOR CANVAS
    const timeToX = (ms, width) => {
        const visibleMs = DAY_MS / zoom;
        return ((ms - offsetMs) / visibleMs) * width;
    };

    const xToTime = (x, width) => {
        const visibleMs = DAY_MS / zoom;
        return offsetMs + (x / width) * visibleMs;
    };

    const formatTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // 4. DRAW TIMELINE
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !serverDayStart) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const visibleMs = DAY_MS / zoom;

        // Clear
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, width, height);

        // --- GRID ---
        let step;
        if (visibleMs > 12 * HOUR_MS) step = HOUR_MS;
        else if (visibleMs > 3 * HOUR_MS) step = 30 * MIN_MS;
        else if (visibleMs > 1 * HOUR_MS) step = 10 * MIN_MS;
        else step = 1 * MIN_MS;

        ctx.lineWidth = 1;
        for (let t = Math.floor(offsetMs / step) * step; t < offsetMs + visibleMs; t += step) {
            const x = timeToX(t, width);
            if (x < 0 || x > width) continue;

            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Label
            if (t % HOUR_MS === 0 || visibleMs < 4 * HOUR_MS) {
                ctx.fillStyle = '#888';
                ctx.font = '10px Arial';
                const h = Math.floor(t / HOUR_MS);
                const m = Math.floor((t % HOUR_MS) / MIN_MS);
                if (t >= 0 && t <= DAY_MS) {
                    ctx.fillText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, x + 2, 12);
                }
            }
        }

        // --- SEGMENTS (Green) ---
        ctx.fillStyle = '#2ecc71';
        timelineSegments.forEach(s => {
            const sStart = Number(s.start_ts) - serverDayStart;
            const sEnd = (s.end_ts === 0 ? Date.now() : Number(s.end_ts)) - serverDayStart;

            const x1 = timeToX(sStart, width);
            const x2 = timeToX(sEnd, width);
            const w = Math.max(x2 - x1, 1);

            if (x1 + w < 0 || x1 > width) return;
            ctx.fillRect(x1, 25, w, 25);
        });

        // --- PLAYHEAD (Red) ---
        if (playheadMs !== null) {
            const px = timeToX(playheadMs, width);
            if (px >= 0 && px <= width) {
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, height);
                ctx.stroke();

                // Little triangle at top
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.moveTo(px - 5, 0);
                ctx.lineTo(px + 5, 0);
                ctx.lineTo(px, 8);
                ctx.fill();
            }
        }
    }, [timelineSegments, serverDayStart, zoom, offsetMs, playheadMs]);

    useEffect(() => {
        draw();
    }, [draw]);

    // 5. UPDATE PLAYHEAD FROM VIDEO
    useEffect(() => {
        const interval = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused && lastSeekBaseTs.current > 0) {
                const currentAbsoluteTs = lastSeekBaseTs.current + (videoRef.current.currentTime * 1000);
                const relativeMs = currentAbsoluteTs - serverDayStart;
                setPlayheadMs(relativeMs);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [serverDayStart]);

    // 6. ZOOM HANDLER
    const handleWheel = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseTime = xToTime(mouseX, rect.width);

        const delta = e.deltaY > 0 ? 1.2 : 0.8;
        let newZoom = Math.min(100, Math.max(1, zoom * (e.deltaY > 0 ? 0.8 : 1.2)));

        const newVisibleMs = DAY_MS / newZoom;
        let newOffset = mouseTime - (mouseX / rect.width) * newVisibleMs;

        // Clamping
        newOffset = Math.max(-newVisibleMs * 0.1, Math.min(DAY_MS - newVisibleMs * 0.9, newOffset));

        setZoom(newZoom);
        setOffsetMs(newOffset);
    };

    // 7. CLICK HANDLER
    const handleCanvasClick = (e) => {
        if (!serverDayStart) return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickedRelativeMs = xToTime(x, rect.width);
        const absoluteTs = Math.floor(serverDayStart + clickedRelativeMs);

        setPlayheadMs(clickedRelativeMs);
        setSeekInfo(`Seeking to: ${selectedDate} ${formatTime(clickedRelativeMs)}`);

        loadPlayback(absoluteTs);
    };

    const loadPlayback = (ts) => {
        if (videoRef.current) {
            const url = `${API.defaults.baseURL}/playback/stream/${camId}?ts=${ts}&_nocache=${Date.now()}`;
            console.log(`[Player] Loading: ${url}`);

            // We need to know which segment we started from to track playhead accurately
            // For now, assume the seek timestamp is the base
            lastSeekBaseTs.current = ts;

            videoRef.current.src = url;
            videoRef.current.load();
            videoRef.current.play().catch(e => console.error("Play error:", e));
        }
    };

    return (
        <div className="playback-page" style={{ padding: 20, background: '#1a1a1a', color: '#eee', minHeight: '100vh' }}>
            {/* TOOLBAR */}
            <div style={{ marginBottom: 15, display: 'flex', gap: 15, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#888' }}>Camera</label>
                    <select
                        value={camId}
                        onChange={e => setCamId(e.target.value)}
                        style={{ padding: '6px 10px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4 }}
                    >
                        {cameras.map(c => <option key={c.id} value={c.id}>{c.name || c.ip}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#888' }}>Date</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        style={{ padding: '5px 10px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4 }}
                    />
                </div>

                <button
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: 15,
                        padding: '7px 15px',
                        cursor: 'pointer',
                        background: '#2ecc71',
                        color: '#000',
                        border: 'none',
                        borderRadius: 4,
                        fontWeight: 'bold'
                    }}
                >
                    Refresh
                </button>

                <div style={{ flex: 1 }}></div>

                {seekInfo && (
                    <div style={{ color: '#f1c40f', fontWeight: 'bold', fontSize: 14, background: 'rgba(0,0,0,0.3)', padding: '5px 15px', borderRadius: 20 }}>
                        {seekInfo}
                    </div>
                )}

                {stats.first && stats.first > 1700000000000 && (
                    <div style={{ fontSize: 12, color: '#2ecc71', textAlign: 'right' }}>
                        <div>Archive range:</div>
                        <div style={{ fontWeight: 'bold' }}>
                            {new Date(stats.first).toLocaleString()} - {new Date(stats.last).toLocaleString()}
                        </div>
                    </div>
                )}
            </div>

            {/* PLAYER */}
            <div className="video-container" style={{ background: '#000', borderRadius: 8, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', width: '100%', height: '65vh', marginBottom: 15 }}>
                <video
                    ref={videoRef}
                    id="player"
                    controls
                    autoPlay
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => console.error("Video element error:", e)}
                />
            </div>

            {/* TIMELINE */}
            <div
                className="timeline-container"
                style={{
                    width: '100%',
                    height: 80,
                    position: 'relative',
                    border: '1px solid #333',
                    borderRadius: 4,
                    overflow: 'hidden'
                }}
            >
                <canvas
                    ref={canvasRef}
                    id="timeline"
                    width={2000}
                    height={80}
                    style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
                    onClick={handleCanvasClick}
                    onWheel={handleWheel}
                />
            </div>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: 11 }}>
                <div>* Use mouse wheel to ZOOM. Click to SEEK.</div>
                <div>Zoom: {zoom.toFixed(1)}x</div>
            </div>
        </div>
    );
};

export default Playback;
