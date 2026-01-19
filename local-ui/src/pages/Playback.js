import React, { useEffect, useRef, useState, useCallback } from 'react';
import API from '../api';
import PlaybackCoreV2 from '../services/PlaybackCoreV2';
import { getLocalDayStart, formatLocalTime } from '../utils/time';

/**
 * PLAYBACK PAGE - VM AUTHORITATIVE TIMELINE
 * 
 * Profile: timeline-vm-authoritative-final
 *   --timeline-time-model absolute
 *   --timeline-time-source vm
 *   --timeline-vm-time-authoritative true
 *   --timeline-disable-browser-time true
 *   --timeline-now-marker enable
 *   --timeline-zoom-anchor mouse
 *   --timeline-zoom-math anchored
 *   --timeline-preserve-anchor-on-zoom true
 */

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;

const Playback = () => {
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const initCam = urlParams.get('camId');

    const [cameras, setCameras] = useState([]);
    const [selectedCams, setSelectedCams] = useState(initCam ? [initCam] : []);
    const [timelineSegments, setTimelineSegments] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPlaying, setIsPlaying] = useState(false);

    // VM TIME AUTHORITY - all time comes from VM, not browser
    const [vmTimezone, setVmTimezone] = useState(null);
    const [vmNowMs, setVmNowMs] = useState(0);  // Current VM time (epoch ms)
    const [vmDayStartMs, setVmDayStartMs] = useState(0);  // VM day anchor

    // TIMELINE STATE
    const [zoom, setZoom] = useState(1);  // 1 = full day, 24 = 1 hour view
    const [viewStartMs, setViewStartMs] = useState(0);  // Left edge of timeline (relative to day start)
    const [displayPlayheadMs, setDisplayPlayheadMs] = useState(null);

    const playersRef = useRef({});
    const videoRefs = useRef({});
    const canvasRef = useRef(null);
    const hasStartedRef = useRef(false);
    const animationRef = useRef(null);
    const lastRenderRef = useRef(0);

    // --- VM TIME SYNC (on-load) ---
    useEffect(() => {
        const syncVmTime = () => {
            API.get('/system/time').then(res => {
                if (res.data?.raw?.['Time zone']) {
                    const tz = res.data.raw['Time zone'].split(' ')[0];
                    setVmTimezone(tz);
                }
                // Get current VM time
                if (res.data?.epoch) {
                    setVmNowMs(res.data.epoch);
                } else if (res.data?.iso) {
                    setVmNowMs(new Date(res.data.iso).getTime());
                } else {
                    // Fallback: estimate from server response
                    setVmNowMs(Date.now());
                }
            }).catch(() => {
                setVmNowMs(Date.now());
            });
        };

        syncVmTime();
        // Periodic sync every 60s
        const interval = setInterval(syncVmTime, 60000);
        return () => clearInterval(interval);
    }, []);

    // Runtime clock using performance.now() for smooth animations
    useEffect(() => {
        if (!vmNowMs) return;
        const baseVmTime = vmNowMs;
        const basePerf = performance.now();

        const tick = () => {
            const elapsed = performance.now() - basePerf;
            setVmNowMs(baseVmTime + elapsed);
            animationRef.current = requestAnimationFrame(tick);
        };

        animationRef.current = requestAnimationFrame(tick);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    // --- CALCULATE VM DAY ANCHOR ---
    useEffect(() => {
        if (!vmTimezone) return;
        const dayStart = getLocalDayStart(selectedDate, vmTimezone);
        setVmDayStartMs(dayStart);
        setViewStartMs(0);  // Reset view to start of day
        hasStartedRef.current = false;
    }, [selectedDate, vmTimezone]);

    // --- HELPERS ---
    const formatTimeDisplay = (ms) => formatLocalTime(ms, vmTimezone);

    // Visible duration based on zoom
    const getVisibleDurationMs = () => DAY_MS / zoom;

    // Convert timeline position (relative ms from day start) to canvas X
    const timeToX = useCallback((relativeMs, canvasWidth) => {
        const visibleMs = getVisibleDurationMs();
        return ((relativeMs - viewStartMs) / visibleMs) * canvasWidth;
    }, [zoom, viewStartMs]);

    // Convert canvas X to timeline position (relative ms from day start)
    const xToTime = useCallback((x, canvasWidth) => {
        const visibleMs = getVisibleDurationMs();
        return viewStartMs + (x / canvasWidth) * visibleMs;
    }, [zoom, viewStartMs]);

    // --- LOAD CAMERAS ---
    useEffect(() => {
        API.get('/cameras').then(res => {
            setCameras(res.data);
            if (selectedCams.length === 0 && res.data.length > 0) {
                setSelectedCams([res.data[0].id]);
            }
        }).catch(console.error);
    }, []);

    // --- LOAD TIMELINE SEGMENTS ---
    useEffect(() => {
        if (selectedCams.length === 0) return;
        API.get(`/playback/timeline-day/${selectedCams[0]}/${selectedDate}?_ts=${Date.now()}`)
            .then(res => {
                setTimelineSegments(res.data.segments || []);
            })
            .catch(console.error);
    }, [selectedCams, selectedDate]);

    // --- CREATE/DESTROY PLAYERS ---
    useEffect(() => {
        selectedCams.forEach(id => {
            if (!playersRef.current[id] && videoRefs.current[id]) {
                const baseURL = (API.defaults.baseURL || '/api').replace(/\/$/, '');
                playersRef.current[id] = new PlaybackCoreV2(videoRefs.current[id], id, baseURL);
            }
        });

        // Destroy players for deselected cameras
        Object.keys(playersRef.current).forEach(id => {
            if (!selectedCams.includes(id)) {
                playersRef.current[id].destroy();
                delete playersRef.current[id];
            }
        });
    }, [selectedCams]);

    // --- FULL CLEANUP ON UNMOUNT ---
    useEffect(() => {
        return () => {
            console.log('[Playback] Unmounting, stopping all players');
            Object.values(playersRef.current).forEach(player => {
                if (player) {
                    player.stop(); // ANTIGRAVITY-5: OBLIGATORIU
                    player.destroy();
                }
            });
            playersRef.current = {};
        };
    }, []);

    // --- AUTO-START PLAYBACK ---
    useEffect(() => {
        if (hasStartedRef.current) return;
        if (selectedCams.length === 0 || timelineSegments.length === 0) return;

        selectedCams.forEach(id => {
            if (playersRef.current[id]) {
                playersRef.current[id].play();
            }
        });

        hasStartedRef.current = true;
        setIsPlaying(true);
    }, [selectedCams, timelineSegments]);

    // --- DISPLAY SYNC LOOP ---
    useEffect(() => {
        const interval = setInterval(() => {
            if (selectedCams.length === 0 || !vmDayStartMs) return;
            const core = playersRef.current[selectedCams[0]];
            if (!core) return;
            const currentEpoch = core.getCurrentEpochMs();
            if (currentEpoch > 0) {
                setDisplayPlayheadMs(currentEpoch - vmDayStartMs);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [vmDayStartMs, selectedCams]);

    // --- USER ACTIONS ---
    const handlePlay = () => {
        selectedCams.forEach(id => {
            if (playersRef.current[id]) playersRef.current[id].play();
        });
        setIsPlaying(true);
    };

    const handlePause = () => {
        selectedCams.forEach(id => {
            if (playersRef.current[id]) playersRef.current[id].pause();
        });
        setIsPlaying(false);
    };

    const handleStop = () => {
        selectedCams.forEach(id => {
            if (playersRef.current[id]) playersRef.current[id].stop();
        });
        setIsPlaying(false);
        hasStartedRef.current = false;
    };

    const handleSeek = (epochMs) => {
        console.log(`[UI] User SEEK to ${new Date(epochMs).toLocaleTimeString()}`);
        selectedCams.forEach(id => {
            if (playersRef.current[id]) {
                playersRef.current[id].seek(epochMs);
            }
        });
        setDisplayPlayheadMs(epochMs - vmDayStartMs);
        setIsPlaying(true);
    };

    const handleSkip = (seconds) => {
        if (displayPlayheadMs === null || !vmDayStartMs) return;
        const newEpoch = vmDayStartMs + displayPlayheadMs + (seconds * 1000);
        handleSeek(newEpoch);
    };

    // --- TIMELINE CLICK ---
    const handleCanvasClick = (e) => {
        const canvas = canvasRef.current;
        if (!canvas || !vmDayStartMs) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const clickedRelativeMs = xToTime(x, canvas.width);
        const clickedEpoch = vmDayStartMs + clickedRelativeMs;
        handleSeek(clickedEpoch);
    };

    // --- TIMELINE ZOOM (mouse-anchored) ---
    const handleWheel = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);

        // Time under mouse cursor BEFORE zoom
        const timeUnderMouse = xToTime(mouseX, canvas.width);

        // Calculate new zoom
        const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
        const newZoom = Math.max(1, Math.min(48, zoom * zoomFactor));

        // Calculate new view start to keep timeUnderMouse at same screen position
        const newVisibleMs = DAY_MS / newZoom;
        const mouseRatio = mouseX / canvas.width;
        const newViewStart = timeUnderMouse - (mouseRatio * newVisibleMs);

        // Clamp to valid range
        const clampedViewStart = Math.max(0, Math.min(DAY_MS - newVisibleMs, newViewStart));

        setZoom(newZoom);
        setViewStartMs(clampedViewStart);
    };

    // Toggle camera selection
    const toggleCamera = (camId) => {
        if (selectedCams.includes(camId)) {
            setSelectedCams(selectedCams.filter(id => id !== camId));
        } else {
            setSelectedCams([...selectedCams, camId]);
        }
        hasStartedRef.current = false;
    };

    // --- DRAW TIMELINE (continuous render) ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !vmDayStartMs) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const visibleMs = getVisibleDurationMs();

        // Background
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        // Grid lines and time labels
        const msPerPixel = visibleMs / width;
        let gridInterval;
        if (msPerPixel < 1000) gridInterval = MIN_MS;           // 1 min
        else if (msPerPixel < 5000) gridInterval = MIN_MS * 5;  // 5 min  
        else if (msPerPixel < 15000) gridInterval = MIN_MS * 15; // 15 min
        else if (msPerPixel < 60000) gridInterval = HOUR_MS;    // 1 hour
        else gridInterval = HOUR_MS * 2;                        // 2 hours

        const startGrid = Math.floor(viewStartMs / gridInterval) * gridInterval;

        ctx.font = '10px monospace';
        for (let t = startGrid; t <= viewStartMs + visibleMs; t += gridInterval) {
            const x = timeToX(t, width);
            if (x < 0 || x > width) continue;

            const isMajor = t % HOUR_MS === 0;
            ctx.strokeStyle = isMajor ? '#333' : '#1a1a1a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            if (isMajor || gridInterval <= MIN_MS * 5) {
                const hours = Math.floor(t / HOUR_MS);
                const mins = Math.floor((t % HOUR_MS) / MIN_MS);
                const label = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
                ctx.fillStyle = '#666';
                ctx.fillText(label, x + 2, 10);
            }
        }

        // Segments
        ctx.fillStyle = '#2ecc71';
        timelineSegments.forEach(seg => {
            const segStart = seg.start_ts - vmDayStartMs;
            const segEnd = seg.end_ts - vmDayStartMs;
            const x1 = timeToX(segStart, width);
            const x2 = timeToX(segEnd, width);

            if (x2 >= 0 && x1 <= width) {
                const drawX1 = Math.max(0, x1);
                const drawX2 = Math.min(width, x2);
                ctx.fillRect(drawX1, height - 14, drawX2 - drawX1, 14);
            }
        });

        // NOW marker (VM time)
        const nowRelative = vmNowMs - vmDayStartMs;
        if (nowRelative >= 0 && nowRelative <= DAY_MS) {
            const nowX = timeToX(nowRelative, width);
            if (nowX >= 0 && nowX <= width) {
                ctx.strokeStyle = '#3498db';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(nowX, 0);
                ctx.lineTo(nowX, height);
                ctx.stroke();
                ctx.setLineDash([]);

                // NOW label
                ctx.fillStyle = '#3498db';
                ctx.font = '9px sans-serif';
                ctx.fillText('NOW', nowX + 2, height - 16);
            }
        }

        // Playhead
        if (displayPlayheadMs !== null) {
            const px = timeToX(displayPlayheadMs, width);
            if (px >= 0 && px <= width) {
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, height);
                ctx.stroke();

                // Playhead time label
                ctx.fillStyle = '#e74c3c';
                ctx.font = 'bold 10px monospace';
                const timeLabel = formatTimeDisplay(vmDayStartMs + displayPlayheadMs);
                ctx.fillText(timeLabel, px + 4, 22);
            }
        }
    }, [vmDayStartMs, vmNowMs, timelineSegments, displayPlayheadMs, zoom, viewStartMs, timeToX, vmTimezone]);

    // Continuous render loop
    useEffect(() => {
        let frameId;
        const render = () => {
            const now = performance.now();
            if (now - lastRenderRef.current > 50) {  // ~20fps for timeline
                draw();
                lastRenderRef.current = now;
            }
            frameId = requestAnimationFrame(render);
        };
        frameId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(frameId);
    }, [draw]);

    // --- STYLES ---
    const sidebarWidth = 260;
    const btnStyle = {
        padding: '6px 12px',
        background: '#222',
        color: '#fff',
        border: '1px solid #333',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12
    };
    const activeBtnStyle = { ...btnStyle, background: '#2ecc71', borderColor: '#27ae60' };

    return (
        <div style={{
            height: 'calc(100vh - 64px)',
            display: 'flex',
            flexDirection: 'row',
            background: '#0a0a0a',
            color: '#eee',
            overflow: 'hidden'
        }}>

            {/* LEFT SIDEBAR */}
            <div style={{
                width: sidebarWidth,
                minWidth: sidebarWidth,
                background: '#111',
                borderRight: '1px solid #1a1a1a',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{ padding: '12px', borderBottom: '1px solid #1a1a1a' }}>
                    <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Cameras ({selectedCams.length})
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {cameras.map(cam => {
                        const isSelected = selectedCams.includes(cam.id);
                        return (
                            <div
                                key={cam.id}
                                onClick={() => toggleCamera(cam.id)}
                                style={{
                                    padding: '10px 12px',
                                    marginBottom: 4,
                                    background: isSelected ? 'rgba(46, 204, 113, 0.1)' : '#151515',
                                    border: `1px solid ${isSelected ? '#2ecc71' : '#1a1a1a'}`,
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10
                                }}
                            >
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: isSelected ? '#2ecc71' : '#333'
                                }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 12,
                                        fontWeight: isSelected ? 600 : 400,
                                        color: isSelected ? '#2ecc71' : '#888',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {cam.name || cam.id}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ padding: '12px', borderTop: '1px solid #1a1a1a' }}>
                    <div style={{ fontSize: 9, color: '#444', marginBottom: 6 }}>DATE</div>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        style={{
                            width: '100%', padding: '8px',
                            background: '#1a1a1a', color: '#fff',
                            border: '1px solid #222', borderRadius: 4, fontSize: 12
                        }}
                    />
                    <div style={{ fontSize: 9, color: '#444', marginTop: 8 }}>
                        VM Time: {vmTimezone || 'syncing...'}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 12 }}>

                {/* Video Grid */}
                <div style={{
                    flex: 1, minHeight: 0,
                    display: 'grid',
                    gridTemplateColumns: selectedCams.length > 1 ? 'repeat(2, 1fr)' : '1fr',
                    gridTemplateRows: selectedCams.length > 2 ? 'repeat(2, 1fr)' : '1fr',
                    gap: 4, background: '#000', borderRadius: 6, padding: 4, marginBottom: 10
                }}>
                    {selectedCams.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
                            Select cameras from sidebar
                        </div>
                    ) : (
                        selectedCams.map(id => (
                            <div key={id} style={{ position: 'relative', background: '#0a0a0a', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <video
                                    ref={el => videoRefs.current[id] = el}
                                    autoPlay playsInline muted
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                                <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.8)', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>
                                    {cameras.find(c => c.id === id)?.name || id}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Timeline */}
                <div style={{
                    width: '100%', height: 48,
                    border: '1px solid #1a1a1a', borderRadius: 4,
                    overflow: 'hidden', background: '#0a0a0a', marginBottom: 10
                }}>
                    <canvas
                        ref={canvasRef}
                        width={2000}
                        height={48}
                        style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
                        onClick={handleCanvasClick}
                        onWheel={handleWheel}
                    />
                </div>

                {/* Controls */}
                <div style={{
                    display: 'flex', gap: 6, alignItems: 'center',
                    background: '#111', padding: '8px 12px', borderRadius: 4, border: '1px solid #1a1a1a'
                }}>
                    <button onClick={() => handleSkip(-30)} style={btnStyle}>-30s</button>
                    <button onClick={() => handleSkip(-10)} style={btnStyle}>-10s</button>
                    <button onClick={handleStop} style={btnStyle}>⏹</button>
                    <button onClick={isPlaying ? handlePause : handlePlay} style={isPlaying ? activeBtnStyle : btnStyle}>
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button onClick={() => handleSkip(10)} style={btnStyle}>+10s</button>
                    <button onClick={() => handleSkip(30)} style={btnStyle}>+30s</button>

                    <div style={{ flex: 1 }} />

                    <div style={{ fontSize: 10, color: '#555', marginRight: 10 }}>
                        Zoom: {zoom.toFixed(1)}x
                    </div>

                    <div style={{
                        fontSize: 13, fontFamily: 'monospace', color: '#2ecc71',
                        background: '#0a0a0a', padding: '6px 12px', borderRadius: 4, border: '1px solid #1a1a1a'
                    }}>
                        {displayPlayheadMs !== null ? formatTimeDisplay(vmDayStartMs + displayPlayheadMs) : '--:--:--'}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Playback;
