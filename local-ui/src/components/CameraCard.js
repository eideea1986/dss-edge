import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { colors } from "../theme";
import DualStreamPlayer from "./DualStreamPlayer"; // Dual Stream for Instant Fullscreen Switch
import RecorderPlayer from "./RecorderPlayer"; // For High Quality Playback View
import MSEPlayer from "./MSEPlayer"; // For Robust Live Fullscreen (TCP)
import { Maximize, Minimize, Circle, Activity, Archive, Shield, Lock, SettingsIcon as Settings, Video } from "./Icons";

// --- STYLES ---
const containerStyle = {
    position: "relative",
    width: "100%",
    height: "100%",
    background: "#000",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1px solid #333",
    borderRadius: 2
};

const iconBtnStyle = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "rgba(255,255,255,0.9)",
    borderRadius: 4,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    marginRight: 2
};

// --- ZONE OVERLAY COMPONENT ---
function ZoneOverlay({ cam }) {
    const containerRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const [dims, setDims] = useState({ w: 0, h: 0 });

    React.useEffect(() => {
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDims({ w: Math.round(width), h: Math.round(height) });
            }
        });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || dims.w === 0) return;
        const ctx = canvas.getContext("2d");

        ctx.clearRect(0, 0, dims.w, dims.h);

        const zones = cam.ai_server?.zones || [];
        if (zones.length === 0 && cam.ai_server?.roi) {
            zones.push({ points: cam.ai_server.roi });
        }

        const drawZone = (pts) => {
            if (!pts || pts.length === 0) return;
            ctx.beginPath();
            const x0 = pts[0][0] > 1 ? pts[0][0] : pts[0][0] * dims.w;
            const y0 = pts[0][1] > 1 ? pts[0][1] : pts[0][1] * dims.h;

            ctx.moveTo(x0, y0);

            for (let i = 1; i < pts.length; i++) {
                const x = pts[i][0] > 1 ? pts[i][0] : pts[i][0] * dims.w;
                const y = pts[i][1] > 1 ? pts[i][1] : pts[i][1] * dims.h;
                ctx.lineTo(x, y);
            }

            ctx.closePath();
            ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
        };

        zones.forEach(z => {
            if (z.points) drawZone(z.points);
        });

    }, [cam, dims]);

    return (
        <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
            <canvas
                ref={canvasRef}
                width={dims.w}
                height={dims.h}
                style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }}
            />
        </div>
    );
}

// --- COMPONENT ---
function CameraCard({ cam, isMaximized, isHidden, onUpdate, onMaximise, isArmed, health }) {
    const navigate = useNavigate();
    const [hover, setHover] = useState(false);
    const [quality, setQuality] = useState('hd');
    const [contextMenu, setContextMenu] = useState(null);

    React.useEffect(() => {
        const h = () => setContextMenu(null);
        window.addEventListener('click', h);
        return () => window.removeEventListener('click', h);
    }, []);

    const handleContextMenu = (e) => {
        e.preventDefault();
        setContextMenu({ x: e.pageX, y: e.pageY });
    };

    const handleMaximise = (e) => {
        e?.stopPropagation();
        onMaximise(cam);
    };

    const handlePlayback = (e) => {
        e.stopPropagation();
        navigate(`/playback?camId=${cam.id}`);
    };

    const isRecording = cam.record !== false;
    const isOnline = health ? health.connected : false;

    return (
        <div style={containerStyle}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onContextMenu={handleContextMenu}
        >
            {/* CONTEXT MENU */}
            {contextMenu && (
                <div style={{
                    position: "fixed", top: contextMenu.y, left: contextMenu.x,
                    background: "#222", border: "1px solid #444", borderRadius: 6,
                    padding: "4px 0", zIndex: 1000, minWidth: 160,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
                }}>
                    <div
                        style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#fff" }}
                        onMouseEnter={(e) => e.target.style.background = "#333"}
                        onMouseLeave={(e) => e.target.style.background = "transparent"}
                        onClick={() => navigate(`/settings?tab=hardware&camId=${cam.id}`)}
                    >
                        <Settings size={14} color="#aaa" /> Setări Cameră (HW)
                    </div>
                    <div
                        style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#fff" }}
                        onMouseEnter={(e) => e.target.style.background = "#333"}
                        onMouseLeave={(e) => e.target.style.background = "transparent"}
                        onClick={() => navigate(`/settings?tab=channels&camId=${cam.id}`)}
                    >
                        <Video size={14} color="#aaa" /> Setări Canal (AI)
                    </div>
                </div>
            )}

            {/* VIDEO AREA - SMART DUAL STREAM */}
            <div style={{ flex: 1, position: "relative", background: "#000", cursor: "pointer", width: "100%" }}
                onClick={() => !isMaximized && onMaximise(cam)}
            >
                <DualStreamPlayer
                    camId={cam.id}
                    isFullscreen={isMaximized}
                    isHovered={hover}
                    isHidden={isHidden}
                    posterUrl={`/snapshots/${cam.id}.jpg`}
                    style={{ width: "100%", height: "100%" }}
                />

                {/* ZONE OVERLAY */}
                {isArmed && <ZoneOverlay cam={cam} />}

                {/* OVERLAYS */}
                <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    padding: 8,
                    display: "flex", justifyContent: "space-between", alignItems: "flex-end",
                    opacity: (hover || isMaximized) ? 1 : 0,
                    transition: "opacity 0.2s",
                    pointerEvents: (hover || isMaximized) ? "auto" : "none",
                    zIndex: 10
                }}>
                    <div style={{ display: "flex", gap: 4 }}>
                        <button style={iconBtnStyle} title="View Archive / Playback" onClick={handlePlayback}>
                            <Archive size={14} />
                        </button>
                    </div>

                    <div style={{ display: "flex", gap: 4 }}>
                        <button style={iconBtnStyle} title={isMaximized ? "Minimize" : "Maximize"} onClick={handleMaximise}>
                            {isMaximized ? <Minimize size={14} /> : <Maximize size={14} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* HEADER / STATUS BAR */}
            <div style={{
                height: 32, background: isArmed ? "rgba(0, 230, 118, 0.1)" : "#111",
                borderTop: "1px solid #333",
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}>
                    <div style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: isOnline ? "#00e676" : "#f44336",
                        boxShadow: isOnline ? "0 0 8px #00e676" : "none"
                    }} />

                    <div title={isArmed ? "Armed (AI ON)" : "Disarmed (AI OFF)"}>
                        <Shield size={16} color={isArmed ? "#00e676" : "#555"} fill={isArmed ? "rgba(0,230,118,0.2)" : "none"} />
                    </div>

                    <span style={{
                        fontSize: 13, fontWeight: "600",
                        color: isArmed ? "#fff" : "#aaa",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                    }}>
                        {cam.name || cam.ip}
                    </span>

                    {isRecording && <div style={{
                        width: 6, height: 6, borderRadius: "50%", background: "#f44336",
                        animation: `pulse 1.5s infinite`
                    }} title="Recording" />}
                </div>

                <div style={{ fontSize: 9, color: "#444", fontWeight: "bold", letterSpacing: 0.5 }}>
                    {isMaximized ? "MAIN STREAM" : "SUB STREAM"}
                </div>
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
}

export default React.memo(CameraCard);
