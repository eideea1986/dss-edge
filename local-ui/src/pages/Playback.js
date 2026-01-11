import React, { useEffect, useRef, useState, useCallback } from 'react';
import API from '../api';
import PlaybackCoreV2 from '../services/PlaybackCoreV2';

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
    const [isLoading, setIsLoading] = useState(false);

    // TIMELINE UI STATE
    const [zoom, setZoom] = useState(1);
    const [offsetMs, setOffsetMs] = useState(0);
    const [playheadMs, setPlayheadMs] = useState(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const playbackCoreRef = useRef(null);

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
                setOffsetMs(0);
                setZoom(1);
            })
            .catch(err => console.error("Timeline error", err));
    }, [camId, selectedDate]);

    // 3. INIT PLAYBACK CORE (HLS)
    useEffect(() => {
        if (!camId || !videoRef.current) return;

        if (playbackCoreRef.current) {
            playbackCoreRef.current.destroy();
        }

        console.log("[Playback] Init HLS Core for", camId);
        let baseURL = API.defaults.baseURL || '/api';
        if (baseURL.endsWith('/')) baseURL = baseURL.slice(0, -1);

        const core = new PlaybackCoreV2(videoRef.current, camId, baseURL);

        playbackCoreRef.current = core;

        return () => core.destroy();
    }, [camId]);

    // 3.5 AUTO-START ON FIRST SEGMENT
    useEffect(() => {
        if (playbackCoreRef.current && timelineSegments.length > 0 && serverDayStart) {
            if (playheadMs === null) {
                const firstSeg = timelineSegments[0];
                const startTs = Number(firstSeg.start_ts);
                console.log("[AutoStart] Starting at first segment:", new Date(startTs).toLocaleTimeString());
                playbackCoreRef.current.start(startTs);
                setPlayheadMs(startTs - serverDayStart);
            }
        }
    }, [timelineSegments, serverDayStart]);

    // 3.6 LOADING STATE HANDLERS
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        const onWaiting = () => setIsLoading(true);
        const onPlaying = () => setIsLoading(false);
        const onCanPlay = () => setIsLoading(false);

        v.addEventListener('waiting', onWaiting);
        v.addEventListener('playing', onPlaying);
        v.addEventListener('canplay', onCanPlay);

        return () => {
            v.removeEventListener('waiting', onWaiting);
            v.removeEventListener('playing', onPlaying);
            v.removeEventListener('canplay', onCanPlay);
        }
    }, []);

    // 4. SYNC PLAYHEAD (CLOCK)
    useEffect(() => {
        const interval = setInterval(() => {
            if (!playbackCoreRef.current || !serverDayStart) return;

            const currentEpoch = playbackCoreRef.current.getCurrentEpochMs();
            if (currentEpoch && currentEpoch > 0) {
                const relative = currentEpoch - serverDayStart;
                setPlayheadMs(relative);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [serverDayStart]);


    const timeToX = (ms, width) => {
        const visibleMs = DAY_MS / zoom;
        return ((ms - offsetMs) / visibleMs) * width;
    };

    const xToTime = (x, width) => {
        const visibleMs = DAY_MS / zoom;
        return offsetMs + (x / width) * visibleMs;
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !serverDayStart) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const visibleMs = DAY_MS / zoom;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, width, height);

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

        if (playheadMs !== null) {
            const px = timeToX(playheadMs, width);
            if (px >= 0 && px <= width) {
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, height);
                ctx.stroke();
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

    const handleWheel = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseTime = xToTime(mouseX, rect.width);
        let newZoom = Math.min(600, Math.max(1, zoom * (e.deltaY > 0 ? 0.8 : 1.2)));
        const newVisibleMs = DAY_MS / newZoom;
        let newOffset = mouseTime - (mouseX / rect.width) * newVisibleMs;
        newOffset = Math.max(-newVisibleMs * 0.1, Math.min(DAY_MS - newVisibleMs * 0.9, newOffset));
        setZoom(newZoom);
        setOffsetMs(newOffset);
    };

    const handleCanvasClick = (e) => {
        if (!serverDayStart || !playbackCoreRef.current) return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickedRelativeMs = xToTime(x, rect.width);
        const absoluteTs = Math.floor(serverDayStart + clickedRelativeMs);

        console.log(`[UI] Seek at x=${Math.floor(x)} -> time=${new Date(absoluteTs).toLocaleTimeString()}`);
        playbackCoreRef.current.seekTo(absoluteTs);
        setPlayheadMs(clickedRelativeMs);
    };

    return (
        <div className="playback-page" style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#1a1a1a', color: '#eee', padding: '10px 20px', boxSizing: 'border-box', overflow: 'hidden' }}>
            <div style={{ marginBottom: 10, display: 'flex', gap: 15, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Camera</label>
                    <select value={camId} onChange={e => setCamId(e.target.value)} style={{ padding: '4px 8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, outline: 'none' }}>
                        {cameras.map(c => <option key={c.id} value={c.id}>{c.name || c.ip}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Date</label>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ padding: '3px 8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}></div>
                {stats.first && (<div style={{ fontSize: 11, color: '#2ecc71', textAlign: 'right' }}><div>Rec: {new Date(stats.first).toLocaleDateString()} - {new Date(stats.last).toLocaleDateString()}</div></div>)}
            </div>
            <div className="video-container" style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', width: '100%', flex: 1, minHeight: 0, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                <video ref={videoRef} id="player" controls autoPlay playsInline muted style={{ maxHeight: '100%', maxWidth: '100%', outline: 'none' }} />
                {isLoading && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        color: 'white', background: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: '4px', pointerEvents: 'none'
                    }}>
                        Buffering...
                    </div>
                )}
            </div>
            <div className="timeline-container" style={{ width: '100%', height: 80, flexShrink: 0, position: 'relative', border: '1px solid #333', borderRadius: 4, overflow: 'hidden', background: '#222' }}>
                <canvas ref={canvasRef} id="timeline" width={2000} height={80} style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }} onClick={handleCanvasClick} onWheel={handleWheel} />
            </div>
            <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: 10, flexShrink: 0 }}>
                <div>Review Mode: Click on timeline to seek. Wheel to Zoom.</div><div>Zoom: {zoom.toFixed(1)}x</div>
            </div>
        </div>
    );
};
export default Playback;
