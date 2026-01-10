import React, { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import API from "../api";

// --- CSS STYLES (Trassir Enterprise Pro Aesthetic) ---
const styles = `
.trassir-player { 
    height: 100vh; display: flex; flex-direction: column; background: #0a0a0a; color: #eee; font-family: 'Inter', 'Segoe UI', Roboto, sans-serif; 
}
.video-container { 
    flex: 1; background: #000; display: flex; justify-content: center; align-items: center; position: relative; overflow: hidden; min-height: 0;
}
.video-el { 
    max-height: 100%; max-width: 100%; width: auto; height: auto; display: block;
}
.status-badge {
    position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.8); padding: 5px 12px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; border: 1px solid #444; color: #3498db; pointer-events: none; z-index: 100;
}
.timeline-container { 
    background: #151515; border-top: 1px solid #333; display: flex; flex-direction: column; padding: 10px 20px;
}
.timeline-axis { 
    position: relative; height: 50px; background: #222; margin-top: 5px; border-radius: 4px; overflow: hidden; cursor: crosshair; border: 1px solid #333;
}
.timeline-seg-video { 
    position: absolute; height: 100%; background: #2ecc71; opacity: 0.8; border-right: 1px solid #27ae60; min-width: 2px;
}
.timeline-event-marker { 
    position: absolute; width: 3px; height: 100%; background: #e74c3c; z-index: 5;
}
.timeline-cursor { 
    position: absolute; width: 2px; height: 100%; background: #fff; z-index: 10; box-shadow: 0 0 10px #fff; pointer-events: none;
}
.controls-bar { 
    height: 70px; background: #1a1a1a; display: flex; align-items: center; gap: 15px; padding: 0 20px; border-top: 1px solid #222;
}
.btn-control { 
    background: #333; color: #fff; border: 1px solid #444; padding: 8px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 0.85rem; white-space: nowrap; transition: all 0.2s;
}
.btn-control:hover { background: #444; border-color: #555; }
.btn-active { background: #3498db !important; border-color: #2980b9 !important; }
.btn-export { background: #d35400; border-color: #e67e22; }
.jog-container { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 150px; }
.jog-slider { width: 100%; cursor: pointer; accent-color: #3498db; }
.zoom-btn { padding: 4px 8px; font-size: 0.75rem; background: #222; border: 1px solid #444; color: #888; border-radius: 3px; cursor: pointer; }
.zoom-btn.active { background: #444; color: #fff; }
`;

const ZOOM_LEVELS = [
    { label: "24h", range: 86400000 },
    { label: "6h", range: 21600000 },
    { label: "1h", range: 3600000 },
    { label: "10m", range: 600000 }
];

export default function Playback() {
    const [params] = useSearchParams();
    const camId = params.get("camId");

    const [calendar, setCalendar] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [segments, setSegments] = useState([]);
    const [events, setEvents] = useState([]);

    // Playback State
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [status, setStatus] = useState("IDLE");
    const [zoomLevel, setZoomLevel] = useState(ZOOM_LEVELS[0]);

    const videoRef = useRef(null);
    const pcRef = useRef(null);
    const seekTimerRef = useRef(null);

    const dayStart = useMemo(() => new Date(selectedDate + "T00:00:00Z").getTime(), [selectedDate]);

    // Derived: Current visible window for timeline
    const timelineWindow = useMemo(() => {
        const halfRange = zoomLevel.range / 2;
        let start = currentTime - halfRange;
        let end = currentTime + halfRange;

        if (start < dayStart) { start = dayStart; end = dayStart + zoomLevel.range; }
        if (end > dayStart + 86400000) { end = dayStart + 86400000; start = end - zoomLevel.range; }
        return { start, end };
    }, [currentTime, zoomLevel, dayStart]);

    // 1. Fetch Calendar & Initial Segments
    useEffect(() => {
        if (!camId) return;
        API.get(`/recorder/days`).then(res => {
            if (res.data && res.data.length) {
                setCalendar(res.data);
                if (!res.data.includes(selectedDate)) setSelectedDate(res.data[0]);
            }
        }).catch(() => { });
    }, [camId]);

    useEffect(() => {
        if (!camId || !selectedDate) return;
        API.get(`/recorder/timeline/${camId}/${selectedDate}`)
            .then(res => {
                const segs = res.data || [];
                setSegments(segs);
                if (segs.length > 0) {
                    const isNowInRecording = segs.some(s => Date.now() >= s.start && Date.now() <= s.end);
                    if (!isNowInRecording) handleSeek(segs[0].start);
                }
            })
            .catch(e => console.error(e));

        API.get(`/events?cameraId=${camId}&date=${selectedDate}`)
            .then(res => setEvents(res.data || []))
            .catch(() => setEvents([]));
    }, [camId, selectedDate]);

    const [streamUrl, setStreamUrl] = useState(null);
    const wsRef = useRef(null);

    // 2. Direct MJPEG Playback (Solution 1 - No Go2RTC)
    const startWebRTCSession = async (ts, s = 1) => {
        setStatus("CONNECTING...");
        if (wsRef.current) wsRef.current.close();
        setStreamUrl(null); // Clear previous

        try {
            // A. Create Session (Force MJPEG format)
            const res = await API.get(`/recorder/playback/session`, {
                params: {
                    camId,
                    startTs: ts,
                    speed: s,
                    windowMs: zoomLevel.range,
                    format: 'mjpeg'
                }
            });

            const { sessionId } = res.data;

            // B. Set Stream URL (Direct Backend Access)
            // Using a timestamp to force refresh the image stream
            const url = `${API.defaults.baseURL}/recorder/stream/${sessionId}?startTs=${ts}&speed=${s}&format=mjpeg&_t=${Date.now()}`;
            setStreamUrl(url);

            // C. Connect Telemetry (Sync Timeline)
            const ws = new WebSocket(`ws://${window.location.hostname}:8081`);
            wsRef.current = ws;
            ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'subscribe', camId }));
            };
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.type === 'telemetry') {
                    setCurrentTime(data.absTs);
                    setStatus("PLAYING");
                }
            };

            setIsPlaying(true);
        } catch (e) {
            console.error("Playback Error:", e);
            setStatus("ERROR");
        }
    };

    // 3. (REMOVED) Local estimation timer - We now trust the Server Telemetry

    // --- GAP SKIP LOGIC ---
    function findNearestPlayableTs(targetTs) {
        if (!segments || segments.length === 0) return targetTs;
        const inSeg = segments.find(s => targetTs >= s.start && targetTs < s.end);
        if (inSeg) return targetTs;
        const nextSeg = segments.find(s => s.start > targetTs);
        if (nextSeg) return nextSeg.start;
        const last = segments[segments.length - 1];
        return last ? last.end - 100 : targetTs;
    }

    // --- ACTIONS ---
    const handleSeek = (targetAbsTs) => {
        const safeTs = findNearestPlayableTs(targetAbsTs);
        setCurrentTime(safeTs);
        setStatus("SEEKING...");

        // Debounce seek to avoid spamming go2rtc
        if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
        seekTimerRef.current = setTimeout(() => {
            startWebRTCSession(safeTs, speed);
        }, 300);
    };

    const togglePlay = () => {
        if (isPlaying) {
            if (pcRef.current) pcRef.current.close();
            pcRef.current = null;
            setIsPlaying(false);
            setStatus("PAUSED");
        } else {
            startWebRTCSession(currentTime, speed);
        }
    };

    const step = (secs) => { handleSeek(currentTime + secs * 1000); };
    const fineStep = (dir) => { handleSeek(currentTime + (dir * 40)); }; // Approximate one frame at 25fps

    const handleJogChange = (e) => {
        const val = parseFloat(e.target.value);
        setSpeed(val);
        if (val === 0) {
            if (pcRef.current) pcRef.current.close();
            setIsPlaying(false);
            setStatus("PAUSED");
        } else {
            startWebRTCSession(currentTime, val);
        }
    };

    const handleExport = () => {
        const start = currentTime - 30000;
        const end = currentTime + 30000;
        window.open(`${API.defaults.baseURL}/recorder/export/${camId}?start=${start}&end=${end}`, '_blank');
    };

    const formatAbsoluteTime = (ms) => {
        const d = new Date(ms);
        return d.toLocaleTimeString([], { hour12: false }) + "." + d.getMilliseconds().toString().padStart(3, '0');
    };

    return (
        <div className="trassir-player">
            <style>{styles}</style>

            {/* Header */}
            <div style={{ height: 50, background: "#1a1a1a", display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid #333" }}>
                <button onClick={() => window.location.href = '/'} className="btn-control" style={{ marginRight: 20 }}>← Back</button>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.95rem", fontWeight: "bold" }}>{camId}</span>
                    <span style={{ fontSize: "0.75rem", color: "#3498db" }}>TRASSIR Professional Archive</span>
                </div>
                <span style={{ margin: "0 15px", color: "#444" }}>|</span>
                <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="btn-control" style={{ background: "#222", border: "1px solid #444", color: "#eee" }}>
                    {calendar.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: "1.1rem", color: "#3498db", minWidth: 160, textAlign: "right" }}>{formatAbsoluteTime(currentTime)}</div>
                </div>
            </div>

            {/* Main Video Area */}
            <div className="video-container">
                <div className="status-badge">{status} {Math.abs(speed) !== 1 && isPlaying ? `(${speed}x)` : ''}</div>
                {streamUrl ? (
                    <img src={streamUrl} className="video-el" style={{ objectFit: 'fill', width: '100%', height: '100%' }} alt="Stream" />
                ) : (
                    <div style={{ width: '100%', height: '100%', background: '#000' }} />
                )}
            </div>

            {/* Timeline Area */}
            <div className="timeline-container">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Timeline Zoom:</span>
                        {ZOOM_LEVELS.map(z => (
                            <button
                                key={z.label}
                                className={`zoom-btn ${zoomLevel.label === z.label ? 'active' : ''}`}
                                onClick={() => setZoomLevel(z)}
                            >
                                {z.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div
                    className="timeline-axis"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = (e.clientX - rect.left) / rect.width;
                        handleSeek(timelineWindow.start + (pct * zoomLevel.range));
                    }}
                >
                    {/* Recording Segments */}
                    {segments.filter(s => s.end > timelineWindow.start && s.start < timelineWindow.end).map((seg, idx) => (
                        <div
                            key={idx}
                            className="timeline-seg-video"
                            style={{
                                left: `${((Math.max(seg.start, timelineWindow.start) - timelineWindow.start) / zoomLevel.range) * 100}%`,
                                width: `${((Math.min(seg.end, timelineWindow.end) - Math.max(seg.start, timelineWindow.start)) / zoomLevel.range) * 100}%`,
                                zIndex: 1
                            }}
                        />
                    ))}

                    {/* Event Markers */}
                    {events.filter(ev => {
                        const evTime = new Date(ev.timestamp).getTime();
                        return evTime >= timelineWindow.start && evTime <= timelineWindow.end;
                    }).map((ev, idx) => (
                        <div
                            key={idx}
                            className="timeline-event-marker"
                            style={{ left: `${((new Date(ev.timestamp).getTime() - timelineWindow.start) / zoomLevel.range) * 100}%` }}
                            title={ev.label || 'Motion'}
                        />
                    ))}

                    {/* Cursor */}
                    <div
                        className="timeline-cursor"
                        style={{
                            left: `${((currentTime - timelineWindow.start) / zoomLevel.range) * 100}%`,
                            zIndex: 10,
                            display: (currentTime >= timelineWindow.start && currentTime <= timelineWindow.end) ? 'block' : 'none'
                        }}
                    />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", color: "#666", fontSize: "0.7rem", marginTop: 5 }}>
                    <span>{new Date(timelineWindow.start).toLocaleTimeString([], { hour12: false })}</span>
                    <span>{new Date(timelineWindow.start + zoomLevel.range / 2).toLocaleTimeString([], { hour12: false })}</span>
                    <span>{new Date(timelineWindow.end).toLocaleTimeString([], { hour12: false })}</span>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="controls-bar">
                <button className={`btn-control ${isPlaying ? 'btn-active' : ''}`} onClick={togglePlay} style={{ width: 100, fontWeight: "bold" }}>
                    {isPlaying ? "⏸ PAUSE" : "▶ PLAY"}
                </button>

                <div style={{ display: "flex", gap: 5 }}>
                    <button className="btn-control" onClick={() => step(-10)} title="Rewind 10s">« 10s</button>
                    <button className="btn-control" onClick={() => step(-1)} title="Rewind 1s">« 1s</button>
                    <button className="btn-control" onClick={() => step(1)} title="Forward 1s">1s »</button>
                    <button className="btn-control" onClick={() => step(10)} title="Forward 10s">10s »</button>
                </div>

                <div style={{ display: "flex", gap: 5, marginLeft: 15 }}>
                    <button className="btn-control" title="Fine Step Backward" onClick={() => fineStep(-1)}>|«</button>
                    <button className="btn-control" title="Fine Step Forward" onClick={() => fineStep(1)}>»|</button>
                </div>

                {/* Jog Shuttle */}
                <div className="jog-container" style={{ marginLeft: 30 }}>
                    <span style={{ fontSize: "0.7rem", color: "#666", fontWeight: "bold" }}>JOG SHUTTLE</span>
                    <input
                        type="range" min="-8" max="8" step="0.25"
                        value={speed}
                        onChange={handleJogChange}
                        onMouseUp={() => { if (Math.abs(speed) < 1 && Math.abs(speed) > 0) handleJogChange({ target: { value: 1 } }); }}
                        className="jog-slider"
                    />
                    <div style={{ fontSize: "0.8rem", color: "#3498db" }}>{speed}x</div>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                    <button className="btn-control btn-export" onClick={handleExport}>
                        📥 EXPORT CLIP (1m)
                    </button>
                </div>
            </div>
        </div>
    );
}
