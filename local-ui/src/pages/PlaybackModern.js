import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import API from "../api";

export default function PlaybackModern() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const camId = searchParams.get("camId");

    const [selectedDate, setSelectedDate] = useState(null);
    const [files, setFiles] = useState([]);
    const [timeSegments, setTimeSegments] = useState([]);
    const [activeFile, setActiveFile] = useState(null);
    const [streamMode, setStreamMode] = useState("main");
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [videoZoom, setVideoZoom] = useState(1);
    const [timelineZoom, setTimelineZoom] = useState(1); // 1 = 24h view
    const [timelineCenter, setTimelineCenter] = useState(43200); // Noon
    const [isRefreshing, setIsRefreshing] = useState(false);
    const videoRef = useRef(null);

    // Load initial data
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setSelectedDate(today);
    }, []);

    const loadRecordings = () => {
        if (!camId || !selectedDate) return;
        setIsRefreshing(true);
        API.get(`recorder/files/${camId}/${streamMode}/${selectedDate}`).then(res => {
            const rawFiles = res.data;
            const segments = rawFiles.map(f => {
                const [h, m, s] = f.replace(".mp4", "").split("-").map(Number);
                const startSec = h * 3600 + m * 60 + s;
                return { name: f, start: startSec, end: startSec + 60 };
            }).sort((a, b) => a.start - b.start);
            setFiles(rawFiles);
            setTimeSegments(segments);
        }).catch(err => {
            console.error(err);
            setFiles([]);
            setTimeSegments([]);
        }).finally(() => setIsRefreshing(false));
    };

    useEffect(() => {
        loadRecordings();
    }, [camId, selectedDate, streamMode]);

    const handleSeek = (targetTime) => {
        const file = timeSegments.find(f => targetTime >= f.start && targetTime < f.end);
        if (file) {
            if (activeFile?.name !== file.name) setActiveFile(file);
            if (videoRef.current) {
                const offset = targetTime - file.start;
                videoRef.current.currentTime = offset;
            }
        }
        setCurrentTime(targetTime);
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
    };

    const onVideoTimeUpdate = () => {
        if (videoRef.current && activeFile) {
            const exactTime = activeFile.start + videoRef.current.currentTime;
            setCurrentTime(exactTime);

            if (videoRef.current.currentTime >= (activeFile.end - activeFile.start - 0.5)) {
                const nextIndex = timeSegments.findIndex(f => f.name === activeFile.name) + 1;
                if (nextIndex < timeSegments.length) {
                    const next = timeSegments[nextIndex];
                    setActiveFile(next);
                    setCurrentTime(next.start);
                    if (isPlaying && videoRef.current) {
                        setTimeout(() => videoRef.current?.play(), 100);
                    }
                } else {
                    setIsPlaying(false);
                }
            }
        }
    };

    // Zoom handlers
    const handleVideoWheel = (e) => {
        e.preventDefault();
        setVideoZoom(prev => Math.max(0.5, Math.min(3, prev + (e.deltaY > 0 ? -0.1 : 0.1))));
    };

    const handleTimelineWheel = (e) => {
        e.preventDefault();
        setTimelineZoom(prev => Math.max(0.5, Math.min(10, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
    };

    // Timeline render
    const renderTimeline = () => {
        const width = 1200; // increased from 800
        const viewDuration = 86400 / timelineZoom; // seconds visible
        const viewStart = Math.max(0, timelineCenter - viewDuration / 2);
        const viewEnd = Math.min(86400, timelineCenter + viewDuration / 2);
        const pixelsPerSecond = width / (viewEnd - viewStart);

        console.log("Timeline debug:", { segments: timeSegments.length, viewStart, viewEnd, zoom: timelineZoom });

        return (
            <svg width="100%" height={80} style={{ background: "#1a1a1a", borderRadius: 4 }} viewBox={`0 0 ${width} 80`}>
                {/* Grid lines */}
                {Array.from({ length: 25 }).map((_, i) => {
                    const sec = viewStart + (i * (viewEnd - viewStart) / 24);
                    const x = (sec - viewStart) * pixelsPerSecond;
                    const hour = Math.floor(sec / 3600);
                    return (
                        <g key={i}>
                            <line x1={x} y1={0} x2={x} y2={80} stroke="#333" strokeWidth={1} />
                            <text x={x + 2} y={15} fill="#666" fontSize={10}>{hour}h</text>
                        </g>
                    );
                })}

                {/* Recordings - GREEN BARS */}
                {timeSegments.map((seg, idx) => {
                    if (seg.end < viewStart || seg.start > viewEnd) return null;
                    const x = Math.max(0, (seg.start - viewStart) * pixelsPerSecond);
                    const w = Math.min(width - x, (seg.end - seg.start) * pixelsPerSecond);
                    return (
                        <rect
                            key={idx}
                            x={x}
                            y={30}
                            width={w}
                            height={30}
                            fill="#4caf50"
                            opacity={0.8}
                            style={{ cursor: "pointer" }}
                            onClick={() => handleSeek(seg.start)}
                        />
                    );
                })}

                {/* Current time indicator */}
                {currentTime >= viewStart && currentTime <= viewEnd && (
                    <line
                        x1={(currentTime - viewStart) * pixelsPerSecond}
                        y1={0}
                        x2={(currentTime - viewStart) * pixelsPerSecond}
                        y2={80}
                        stroke="#f44336"
                        strokeWidth={3}
                    />
                )}

                {/* Debug text */}
                <text x={10} y={75} fill="#888" fontSize={11}>{timeSegments.length} recordings</text>
            </svg>
        );
    };

    const formatTime = (sec) => {
        const h = Math.floor(sec / 3600).toString().padStart(2, '0');
        const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0a", color: "#fff" }}>
            {/* Header */}
            <div style={{ height: 60, background: "#1a1a1a", display: "flex", alignItems: "center", px: 20, borderBottom: "1px solid #333" }}>
                <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "#007acc", fontSize: 24, cursor: "pointer", marginRight: 20 }}>←</button>
                <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Archive Playback - Camera {camId}</h2>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                        type="date"
                        value={selectedDate || ""}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ background: "#2a2a2a", border: "1px solid #444", color: "#fff", padding: "8px 12px", borderRadius: 4 }}
                    />
                    <button
                        onClick={loadRecordings}
                        disabled={isRefreshing}
                        style={{
                            background: isRefreshing ? "#666" : "#4caf50",
                            border: "none",
                            color: "#fff",
                            padding: "8px 16px",
                            borderRadius: 4,
                            cursor: isRefreshing ? "not-allowed" : "pointer",
                            fontWeight: "bold"
                        }}
                    >
                        {isRefreshing ? "Loading..." : "Refresh"}
                    </button>
                    <div style={{ padding: "8px 12px", background: "#2a2a2a", borderRadius: 4, fontSize: 12 }}>
                        Stream: {streamMode === "main" ? "HQ" : "Sub"}
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div style={{ flex: 1, display: "flex" }}>
                {/* Video */}
                <div
                    style={{ flex: 1, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
                    onWheel={handleVideoWheel}
                >
                    {activeFile ? (
                        <video
                            key={`${streamMode}-${activeFile.name}`}
                            ref={videoRef}
                            src={`${API.defaults.baseURL}/recorder/segments/${camId}/${streamMode}/${selectedDate}/${activeFile.name}`}
                            autoPlay
                            style={{
                                maxWidth: "100%",
                                maxHeight: "100%",
                                objectFit: "contain",
                                transform: `scale(${videoZoom})`,
                                transition: "transform 0.1s"
                            }}
                            onTimeUpdate={onVideoTimeUpdate}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                        />
                    ) : (
                        <div style={{ textAlign: "center", color: "#666" }}>
                            <div style={{ fontSize: 48 }}>📹</div>
                            <div>No recording selected</div>
                        </div>
                    )}
                    <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.7)", padding: "6px 12px", borderRadius: 4, fontSize: 12 }}>
                        Video Zoom: {Math.round(videoZoom * 100)}%
                    </div>
                </div>

                {/* Right Panel - Controls */}
                <div style={{ width: 300, background: "#1a1a1a", borderLeft: "1px solid #333", display: "flex", flexDirection: "column", padding: 20, gap: 15 }}>
                    <div style={{ fontSize: 14, fontWeight: "bold", color: "#007acc" }}>PLAYBACK CONTROLS</div>

                    <button onClick={togglePlay} style={{ ...btnStyle, background: isPlaying ? "#f44336" : "#4caf50", fontSize: 16, height: 50 }}>
                        {isPlaying ? "⏸ PAUSE" : "▶ PLAY"}
                    </button>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <button onClick={() => handleSeek(currentTime - 10)} style={btnStyle}>-10s</button>
                        <button onClick={() => handleSeek(currentTime + 10)} style={btnStyle}>+10s</button>
                        <button onClick={() => handleSeek(currentTime - 60)} style={btnStyle}>-1min</button>
                        <button onClick={() => handleSeek(currentTime + 60)} style={btnStyle}>+1min</button>
                    </div>

                    <div style={{ borderTop: "1px solid #333", paddingTop: 15 }}>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Current Time</div>
                        <div style={{ fontSize: 24, fontWeight: "bold", color: "#007acc", fontFamily: "monospace" }}>
                            {formatTime(currentTime)}
                        </div>
                    </div>

                    <div style={{ borderTop: "1px solid #333", paddingTop: 15 }}>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Speed</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                            {[0.5, 1, 2, 4].map(speed => (
                                <button
                                    key={speed}
                                    onClick={() => videoRef.current && (videoRef.current.playbackRate = speed)}
                                    style={{ ...btnStyle, fontSize: 11, padding: "6px 4px" }}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Timeline Panel */}
            <div
                style={{ height: 100, background: "#1a1a1a", borderTop: "1px solid #333", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}
                onWheel={handleTimelineWheel}
            >
                <div style={{ fontSize: 11, color: "#888" }}>Timeline Zoom: {timelineZoom.toFixed(1)}x (scroll to zoom)</div>
                {renderTimeline()}
            </div>
        </div>
    );
}

const btnStyle = {
    background: "#2a2a2a",
    border: "1px solid #444",
    color: "#fff",
    padding: "10px",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: "bold",
    transition: "all 0.2s"
};
