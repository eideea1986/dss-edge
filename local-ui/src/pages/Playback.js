import React, { useEffect, useRef, useState, useCallback } from 'react';
import API from '../api';
import PlaybackCoreV2 from '../services/PlaybackCoreV2';
import { getLocalDayStart, formatLocalTime, formatLocalDate } from '../utils/time';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;

const Playback = () => {
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const initCam = urlParams.get('camId');

    const [cameras, setCameras] = useState([]);
    const [camId, setCamId] = useState(initCam || '');
    const [timelineSegments, setTimelineSegments] = useState([]);
    const [serverDayStart, setServerDayStart] = useState(0);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [stats, setStats] = useState({ first: null, last: null });
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [firstRecTime, setFirstRecTime] = useState(null);
    const [lastRecTime, setLastRecTime] = useState(null);
    const [serverTimezone, setServerTimezone] = useState(null);

    const [zoom, setZoom] = useState(1);
    const [offsetMs, setOffsetMs] = useState(0);
    const [playheadMs, setPlayheadMs] = useState(null);

    // DEBUG & SYNC STATES
    const [debugSnapshot, setDebugSnapshot] = useState(null);
    const [isSeeking, setIsSeeking] = useState(false); // Lock updates during seek bounce
    const [liveDebug, setLiveDebug] = useState({});

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const playbackCoreRef = useRef(null);

    // --- HELPERS ---
    const formatTimeDisplay = (ms) => formatLocalTime(ms, serverTimezone);
    const formatDateDisplay = (ms) => formatLocalDate(ms, serverTimezone);

    const timeToX = (ms, width) => {
        const visibleMs = DAY_MS / zoom;
        return ((ms - offsetMs) / visibleMs) * width;
    };

    const xToTime = (x, width) => {
        const visibleMs = DAY_MS / zoom;
        return offsetMs + (x / width) * visibleMs;
    };

    // --- EFFECTS ---
    useEffect(() => {
        API.get('/cameras').then(res => {
            setCameras(res.data);
            if (!camId && res.data.length > 0) setCamId(res.data[0].id);
        }).catch(err => console.error("Cameras load error", err));
    }, [camId]);

    useEffect(() => {
        API.get('/system/time').then(res => {
            if (res.data && res.data.raw && res.data.raw['Time zone']) {
                const tzStr = res.data.raw['Time zone'];
                const cleanTz = tzStr.split(' ')[0]; // Handle "Europe/Bucharest (EET, +0200)"
                setServerTimezone(cleanTz);
                console.log("DSS Timezone Standard:", cleanTz);
            }
        }).catch(e => console.warn("Time Sync skipped", e));
    }, []);

    // Calculate Anchor (serverDayStart) when Date or TZ changes
    // This is the CORE of the Local View / UTC Engine architecture.
    useEffect(() => {
        const start = getLocalDayStart(selectedDate, serverTimezone);
        setServerDayStart(start);
    }, [selectedDate, serverTimezone]);

    useEffect(() => {
        if (!camId) return;
        API.get(`/playback/stats/${camId}?_t=${Date.now()}`).then(res => setStats(res.data)).catch(console.error);
    }, [camId]);

    useEffect(() => {
        if (!camId) return;
        API.get(`/playback/timeline-day/${camId}/${selectedDate}?_ts=${Date.now()}`)
            .then(res => {
                const { segments } = res.data;
                // segments are UTC.
                // serverDayStart is UTC anchor for 00:00 Local.
                setTimelineSegments(segments || []);

                if (segments && segments.length > 0) {
                    setFirstRecTime(segments[0].start_ts);
                    setLastRecTime(segments[segments.length - 1].end_ts);
                } else {
                    setFirstRecTime(null);
                    setLastRecTime(null);
                }
                setOffsetMs(0);
                setZoom(1);
            })
            .catch(err => console.error("Timeline error", err));
    }, [camId, selectedDate]);

    useEffect(() => {
        if (!camId || !videoRef.current) return;
        if (playbackCoreRef.current) playbackCoreRef.current.destroy();
        let baseURL = API.defaults.baseURL || '/api';
        if (baseURL.endsWith('/')) baseURL = baseURL.slice(0, -1);
        const core = new PlaybackCoreV2(videoRef.current, camId, baseURL);
        playbackCoreRef.current = core;
        return () => core.destroy();
    }, [camId]);

    // Initial Start
    useEffect(() => {
        if (playbackCoreRef.current && timelineSegments.length > 0 && serverDayStart && playheadMs === null) {
            const firstSeg = timelineSegments[0];
            const startTs = Number(firstSeg.start_ts);
            playbackCoreRef.current.start(startTs);
            setPlayheadMs(startTs - serverDayStart);
            setIsPlaying(true);
        }
    }, [timelineSegments, serverDayStart, playheadMs]);

    // Video Listeners
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const onWaiting = () => setIsLoading(true);
        const onPlaying = () => {
            setIsLoading(false);
            setIsPlaying(true);
            setTimeout(() => { setIsSeeking(false); }, 800);
        };
        const onPause = () => setIsPlaying(false);
        const onCanPlay = () => setIsLoading(false);
        v.addEventListener('waiting', onWaiting);
        v.addEventListener('playing', onPlaying);
        v.addEventListener('pause', onPause);
        v.addEventListener('canplay', onCanPlay);
        return () => {
            v.removeEventListener('waiting', onWaiting);
            v.removeEventListener('playing', onPlaying);
            v.removeEventListener('pause', onPause);
            v.removeEventListener('canplay', onCanPlay);
        }
    }, []);

    // Main Loop & Debug
    useEffect(() => {
        const interval = setInterval(() => {
            if (!playbackCoreRef.current || !serverDayStart) return;
            const currentEpoch = playbackCoreRef.current.getCurrentEpochMs();

            // Live Debug Data
            setLiveDebug({
                BrowserClock: new Date().toLocaleTimeString(),
                LoopEpoch: currentEpoch,
                LoopLocal: formatTimeDisplay(currentEpoch),
                PlayheadMs: playheadMs,
                IsSeeking: isSeeking,
                VideoTime: videoRef.current ? videoRef.current.currentTime.toFixed(2) : 0
            });

            if (currentEpoch && currentEpoch > 0 && !isSeeking) {
                // playheadMs is offset from serverDayStart
                setPlayheadMs(currentEpoch - serverDayStart);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [serverDayStart, isSeeking, playheadMs, serverTimezone]); // Add serverTimezone to dep

    // --- DRAW ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !serverDayStart) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#333';
        ctx.fillStyle = '#eee';
        ctx.font = '11px monospace';

        // Calculate visuals
        const hourWidth = timeToX(HOUR_MS, width) - timeToX(0, width);

        for (let h = 0; h < 24; h++) {
            const hMs = h * HOUR_MS;
            const x = timeToX(hMs, width);

            // Draw Hour (Local Display)
            if (x >= 0 && x <= width) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.strokeStyle = '#444';
                ctx.stroke();
                ctx.fillText(`${h}:00`, x + 3, 12);
            }

            // Draw Minutes if zoomed enough
            if (hourWidth > 60) {
                // 30 min mark
                const m30 = hMs + 30 * MIN_MS;
                const x30 = timeToX(m30, width);
                if (x30 >= 0 && x30 <= width) {
                    ctx.beginPath();
                    ctx.moveTo(x30, height - 10);
                    ctx.lineTo(x30, height);
                    ctx.strokeStyle = '#333';
                    ctx.stroke();
                }
            }

            if (hourWidth > 120) {
                // 15, 45 min marks
                [15, 45].forEach(min => {
                    const m = hMs + min * MIN_MS;
                    const mx = timeToX(m, width);
                    if (mx >= 0 && mx <= width) {
                        ctx.beginPath();
                        ctx.moveTo(mx, height - 6);
                        ctx.lineTo(mx, height);
                        ctx.strokeStyle = '#333';
                        ctx.stroke();
                    }
                });
            }
        }

        ctx.fillStyle = '#2ecc71';
        timelineSegments.forEach(seg => {
            // Draw relative to Local Midnight Anchor
            const startRel = seg.start_ts - serverDayStart;
            const endRel = seg.end_ts - serverDayStart;
            const x1 = timeToX(startRel, width);
            const x2 = timeToX(endRel, width);

            if (x2 >= 0 && x1 <= width) {
                const drawX1 = Math.max(0, x1);
                const drawX2 = Math.min(width, x2);
                const drawWidth = drawX2 - drawX1;
                if (drawWidth > 0) ctx.fillRect(drawX1, height - 20, drawWidth, 20);
            }
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
                // Arrow
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.moveTo(px - 5, 0);
                ctx.lineTo(px + 5, 0);
                ctx.lineTo(px, 8);
                ctx.fill();
            }
        }
    }, [timelineSegments, serverDayStart, zoom, offsetMs, playheadMs]);

    useEffect(() => { draw(); }, [draw]);

    // --- HANDLERS ---
    const handleWheel = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseTime = xToTime(mouseX, rect.width);
        let newZoom = Math.min(600, Math.max(1, zoom * (e.deltaY > 0 ? 0.8 : 1.2)));
        const newVisibleMs = DAY_MS / newZoom;
        let newOffset = mouseTime - (mouseX / rect.width) * newVisibleMs;
        newOffset = Math.max(0, Math.min(DAY_MS - newVisibleMs, newOffset));
        setZoom(newZoom);
        setOffsetMs(newOffset);
    };

    const handleCanvasClick = (e) => {
        if (!serverDayStart || !playbackCoreRef.current) return;
        if (timelineSegments.length === 0) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickedRelativeMs = xToTime(x, rect.width); // Offset 0-24h
        const clampedMs = Math.max(0, Math.min(DAY_MS, clickedRelativeMs));

        // CORE LOGIC: Anchor + Offset = UTC Epoch
        const clickedAbsoluteTs = serverDayStart + clampedMs;

        let nearestSegment = timelineSegments[0];
        let minDistance = Math.abs(nearestSegment.start_ts - clickedAbsoluteTs);
        let clickInside = false;

        for (const seg of timelineSegments) {
            if (clickedAbsoluteTs >= seg.start_ts && clickedAbsoluteTs <= seg.end_ts) {
                nearestSegment = seg;
                minDistance = 0;
                clickInside = true;
                break;
            }
            const distToStart = Math.abs(seg.start_ts - clickedAbsoluteTs);
            if (distToStart < minDistance) {
                minDistance = distToStart;
                nearestSegment = seg;
            }
        }

        // Decide Seek Target
        let seekTs;
        let decisionType = "";

        if (clickInside) {
            seekTs = clickedAbsoluteTs;
            decisionType = "EXACT_IN_SEGMENT";
        } else {
            seekTs = nearestSegment.start_ts;
            decisionType = "SNAP_TO_NEAREST";
        }

        // LOG DEBUG SNAPSHOT
        setDebugSnapshot({
            clickLocal: formatTimeDisplay(clickedAbsoluteTs),
            clickEpoch: clickedAbsoluteTs,
            clickType: clickInside ? "GREEN (DATA)" : "BLACK (NO DATA)",
            decision: decisionType,
            targetLocal: formatTimeDisplay(seekTs),
            targetEpoch: seekTs,
            offsetInfo: `Anchor=${serverDayStart}, Offset=${clampedMs}`
        });

        // Trigger Seek with Grace Period
        setIsSeeking(true);
        playbackCoreRef.current.seekTo(seekTs);
        setPlayheadMs(seekTs - serverDayStart);
    };

    const handlePlay = () => { if (videoRef.current) { videoRef.current.play(); setIsPlaying(true); } };
    const handlePause = () => { if (videoRef.current) { videoRef.current.pause(); setIsPlaying(false); } };
    const handleStop = () => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; setIsPlaying(false); } };
    const handleSkip = (seconds) => {
        if (!playbackCoreRef.current || !serverDayStart) return;
        const currentEpoch = playbackCoreRef.current.getCurrentEpochMs();
        if (currentEpoch) {
            const newTs = currentEpoch + (seconds * 1000);
            playbackCoreRef.current.seekTo(newTs);
            setPlayheadMs(newTs - serverDayStart);
        }
    };
    const handleSpeedChange = (speed) => {
        if (videoRef.current) {
            videoRef.current.playbackRate = speed;
            setPlaybackSpeed(speed);
        }
    };

    // --- STYLES ---
    const btnStyle = { padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s' };
    const activeBtnStyle = { ...btnStyle, background: '#2ecc71', borderColor: '#27ae60' };

    return (
        <div className="playback-page" style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#1a1a1a', color: '#eee', padding: '10px 20px', boxSizing: 'border-box', overflow: 'hidden', position: 'relative' }}>

            {/* ADVANCED DEBUG OVERLAY */}
            <div style={{
                position: 'fixed', top: 60, right: 10,
                background: 'rgba(0,0,0,0.7)', color: '#00ff00',
                padding: '8px', fontSize: '10px', fontFamily: 'Consolas, monospace',
                pointerEvents: 'none', zIndex: 9999, border: '1px solid #00ff00',
                display: 'grid', gridTemplateColumns: 'auto auto', gap: '15px',
                borderRadius: 4, backdropFilter: 'blur(4px)'
            }}>
                <div style={{ gridColumn: '1 / span 2', borderBottom: '1px solid #0f0', fontWeight: 'bold' }}>DEBUG 1550 (LUXON CORE)</div>

                <div>
                    <div style={{ color: 'yellow' }}>LAST CLICK EVENT</div>
                    {debugSnapshot ? (
                        <>
                            <div>Local: {debugSnapshot.clickLocal}</div>
                            <div>Type: {debugSnapshot.clickType}</div>
                            <div>Action: {debugSnapshot.decision}</div>
                            <div>Target: {debugSnapshot.targetLocal}</div>
                            <div style={{ fontSize: 9, color: '#888' }}>{debugSnapshot.offsetInfo}</div>
                        </>
                    ) : <div>No click yet</div>}
                </div>

                <div>
                    <div style={{ color: 'cyan' }}>LIVE SYSTEM</div>
                    <div>Browser: {liveDebug.BrowserClock}</div>
                    <div>LoopTime: {liveDebug.LoopLocal}</div>
                    <div>SeekingLocked: {liveDebug.IsSeeking ? "YES" : "NO"}</div>
                    <div>ServerTZ: {serverTimezone}</div>
                </div>
            </div>

            <div style={{ marginBottom: 10, display: 'flex', gap: 15, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                {/* Cameras Select */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Camera</label>
                    <select
                        value={camId}
                        onChange={e => {
                            const newId = e.target.value;
                            window.location.href = `#/playback?camId=${newId}`;
                            window.location.reload();
                        }}
                        style={{ padding: '4px 8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, outline: 'none' }}
                    >
                        {cameras.map(c => <option key={c.id} value={c.id}>{c.name || c.ip}</option>)}
                    </select>
                </div>
                {/* Date Select */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Date</label>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ padding: '3px 8px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}></div>
                {/* Range Info */}
                {firstRecTime && lastRecTime && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#222', padding: '6px 12px', borderRadius: 4, border: '1px solid #333' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e74c3c', animation: 'pulse 1.5s infinite' }}></div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#e74c3c' }}>REC</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#2ecc71' }}>
                            <div>{formatDateDisplay(firstRecTime)} {formatTimeDisplay(firstRecTime)}</div>
                            <div style={{ color: '#888', marginTop: 2 }}>→ {formatTimeDisplay(lastRecTime)}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Video Player */}
            <div className="video-container" style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', width: '100%', flex: 1, minHeight: 0, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                <video ref={videoRef} id="player" autoPlay playsInline muted style={{ maxHeight: '100%', maxWidth: '100%', outline: 'none' }} />
                {isLoading && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        color: 'white', background: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: '4px', pointerEvents: 'none'
                    }}>
                        Buffering...
                    </div>
                )}
            </div>

            {/* Timeline */}
            <div className="timeline-container" style={{ width: '100%', height: 60, flexShrink: 0, position: 'relative', border: '1px solid #333', borderRadius: 4, overflow: 'hidden', background: '#222', marginBottom: 10 }}>
                <canvas ref={canvasRef} id="timeline" width={2000} height={60} style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }} onClick={handleCanvasClick} onWheel={handleWheel} />
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, padding: '10px 0', borderTop: '1px solid #333' }}>
                <button onClick={() => handleSkip(-10)} style={btnStyle} title="Rewind 10s">⏪ -10s</button>
                <button onClick={handleStop} style={btnStyle} title="Stop">⏹</button>
                <button onClick={isPlaying ? handlePause : handlePlay} style={isPlaying ? activeBtnStyle : btnStyle} title={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? '⏸' : '▶'}
                </button>
                <button onClick={() => handleSkip(10)} style={btnStyle} title="Forward 10s">⏩ +10s</button>

                <div style={{ width: 1, height: 30, background: '#444', margin: '0 10px' }}></div>

                <span style={{ fontSize: 12, color: '#888' }}>Speed:</span>
                <button onClick={() => handleSpeedChange(0.5)} style={playbackSpeed === 0.5 ? activeBtnStyle : btnStyle}>0.5x</button>
                <button onClick={() => handleSpeedChange(1)} style={playbackSpeed === 1 ? activeBtnStyle : btnStyle}>1x</button>
                <button onClick={() => handleSpeedChange(2)} style={playbackSpeed === 2 ? activeBtnStyle : btnStyle}>2x</button>
                <button onClick={() => handleSpeedChange(4)} style={playbackSpeed === 4 ? activeBtnStyle : btnStyle}>4x</button>

                <div style={{ flex: 1 }}></div>
                <div style={{ fontSize: 11, color: '#666' }}>Zoom: {zoom.toFixed(1)}x</div>
            </div>

            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default Playback;
