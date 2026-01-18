import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DualStreamPlayer from "./DualStreamPlayer";
import MSEPlayer from "./MSEPlayer";
import { Maximize, Minimize, Circle, Activity, Archive, Shield, SettingsIcon } from "./Icons";

// --- STYLES ---
const containerStyle = {
    position: "relative",
    width: "100%",
    height: "100%",
    background: "#000",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1px solid #222"
};

const controlBtnStyle = {
    background: "rgba(20,20,20,0.8)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#fff",
    borderRadius: 4,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease"
};

// --- ZONE OVERLAY COMPONENT ---
function ZoneOverlay({ cam, isArmed }) {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const [dims, setDims] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDims({ w: Math.round(width), h: Math.round(height) });
            }
        });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || dims.w === 0 || !isArmed) {
            if (canvas) {
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, dims.w, dims.h);
            }
            return;
        }

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

            // ANTIGRAVITY: --overlay-style "stroke:2px,fill:rgba(0,255,0,0.15)"
            ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
            ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
        };

        zones.forEach(z => { if (z.points) drawZone(z.points); });
    }, [cam, dims, isArmed]);

    return (
        <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
            <canvas ref={canvasRef} width={dims.w} height={dims.h} style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }} />
        </div>
    );
}

// --- MAIN COMPONENT ---
function CameraCard({ cam, isMaximized, isHidden, onUpdate, onMaximise, isArmed, health, isReady, isDegraded, quality = 'sub', isFocused }) {
    const navigate = useNavigate();
    const [hover, setHover] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);

    // Hover Preview Logic
    const [hoverCount, setHoverCount] = useState(0);
    useEffect(() => {
        let t;
        if (hover && !isMaximized) {
            t = setInterval(() => setHoverCount(c => c + 1), 1000);
        } else {
            setHoverCount(0);
        }
        return () => clearInterval(t);
    }, [hover, isMaximized]);

    const showHoverPreview = hoverCount >= 3;

    useEffect(() => {
        const h = () => setContextMenu(null);
        window.addEventListener('click', h);
        return () => window.removeEventListener('click', h);
    }, []);

    const handleContextMenu = (e) => {
        e.preventDefault();
        setContextMenu({ x: e.pageX, y: e.pageY });
    };

    const isRecording = cam.record !== false;
    const isOnline = health ? health.connected : false;
    const isActuallyHovered = isFocused || showHoverPreview;

    // ANTIGRAVITY: --arming-colors "armed=green,disarmed=gray,alert=red"
    const getArmingColor = () => {
        if (isDegraded) return "#e74c3c"; // alert = red
        if (isArmed) return "#2ecc71";   // armed = green
        return "#888";                   // disarmed = gray
    };

    return (
        <div style={{ ...containerStyle, cursor: isMaximized ? "default" : "pointer" }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onContextMenu={handleContextMenu}
            onClick={() => !isMaximized && onMaximise(cam)} // Grid click -> Fullscreen
            onDoubleClick={(e) => {
                if (isMaximized) {
                    e.stopPropagation();
                    onMaximise(null); // Fullscreen double click -> Close
                }
            }}
        >
            {/* VIDEO AREA */}
            <div style={{ flex: 1, position: "relative", background: "#000", overflow: "hidden" }}>
                {quality !== 'off' ? (
                    isMaximized ? (
                        <MSEPlayer
                            url={`ws://${window.location.hostname}:1984/api/ws?src=${cam.id}`}
                            camId={cam.id}
                        />
                    ) : (
                        <DualStreamPlayer
                            camId={cam.id}
                            isFullscreen={isMaximized}
                            isHidden={isHidden}
                            isHovered={isActuallyHovered}
                            posterUrl={`/snapshots/${cam.id}.jpg`}
                            style={{ width: "100%", height: "100%" }}
                        />
                    )
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#111', fontSize: 10 }}>
                        PAUSED
                    </div>
                )}

                {/* UX BADGES / ICONS */}
                <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6, zIndex: 10 }}>
                    {isRecording && (
                        <div style={{ background: "#e74c3c", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold", display: "flex", alignItems: "center", gap: 4 }}>
                            <Circle size={8} fill="white" /> REC
                        </div>
                    )}

                    <div style={{
                        background: getArmingColor(),
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        boxShadow: (isArmed || isDegraded) ? `0 0 10px ${getArmingColor()}80` : "none"
                    }}>
                        <Shield size={10} fill="white" />
                        {isDegraded ? "ALERTA" : (isArmed ? "ARMAT" : "DEZARMAT")}
                    </div>

                    {isMaximized && (
                        <div style={{ background: "rgba(0,0,0,0.6)", color: "#2ecc71", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold", border: "1px solid #2ecc71" }}>
                            MAINSTREAM • 15 FPS
                        </div>
                    )}
                </div>

                {/* INTERACTIVE OVERLAY */}
                <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    padding: "8px", background: "linear-gradient(transparent, rgba(0,0,0,0.95))",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    opacity: (hover || isMaximized) ? 1 : 0, transition: "opacity 0.2s", zIndex: 20
                }}>
                    <span style={{ fontSize: 12, fontWeight: "bold", color: "#fff", textShadow: "0 1px 4px #000" }}>{cam.name || cam.ip}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button style={controlBtnStyle} title="Arhivă Video"
                            onClick={(e) => { e.stopPropagation(); navigate(`/playback?camId=${cam.id}`); }}>
                            <Archive size={16} />
                        </button>

                        <button style={controlBtnStyle} title="Configurare Armare"
                            onClick={(e) => { e.stopPropagation(); navigate(`/settings?tab=channels&camId=${cam.id}`); }}
                            onMouseEnter={(e) => e.target.style.background = getArmingColor()}>
                            <Shield size={16} color="#fff" />
                        </button>

                        <button style={controlBtnStyle} title={isMaximized ? "Minimizeaza" : "Maximizeaza"}
                            onClick={(e) => { e.stopPropagation(); onMaximise(isMaximized ? null : cam); }}>
                            {isMaximized ? <Minimize size={16} /> : <Maximize size={16} />}
                        </button>
                    </div>
                </div>

                {/* ZONES */}
                <ZoneOverlay cam={cam} isArmed={isArmed} />

                {/* CONTEXT MENU */}
                {contextMenu && (
                    <div style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: 4,
                        padding: '4px 0',
                        zIndex: 10000,
                        boxShadow: '0 4px 25px rgba(0,0,0,0.7)',
                        minWidth: 180
                    }}>
                        <ContextItem icon={<Archive size={14} />} label="Arhivă Video" onClick={() => navigate(`/playback?camId=${cam.id}`)} />
                        <ContextItem icon={<SettingsIcon size={14} />} label="Hardware / Dispozitive IP" onClick={() => navigate(`/settings?tab=hardware&camId=${cam.id}`)} />
                        <ContextItem icon={<Activity size={14} />} label="Setări Canal" onClick={() => navigate(`/settings?tab=channels&camId=${cam.id}`)} />
                        <ContextItem icon={<Shield size={14} />} label="Meniu Armare" onClick={() => navigate(`/settings?tab=arming&camId=${cam.id}`)} />
                    </div>
                )}
            </div>
        </div>
    );
}

function ContextItem({ icon, label, onClick }) {
    const [hover, setHover] = useState(false);
    return (
        <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            style={{
                padding: '10px 14px',
                color: hover ? '#fff' : '#ccc',
                background: hover ? '#333' : 'transparent',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.1s ease',
                borderBottom: '1px solid #222'
            }}
        >
            {icon} {label}
        </div>
    );
}

export default React.memo(CameraCard);
