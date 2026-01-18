import React, { useEffect, useState } from "react";
import { API } from "../api";
import CameraCard from "../components/CameraCard";
import { formatLocalTime } from '../utils/time';

// Styles
const colors = {
    bg: "#1e1e1e",
    text: "#cccccc",
    accent: "#007acc"
};

export default function Live() {
    const [cams, setCams] = useState([]);
    const [status, setStatus] = useState("Checking...");
    const [selectedCam, setSelectedCam] = useState(null);
    const [gridSize, setGridSize] = useState(8);
    const [armingStatus, setArmingStatus] = useState({});
    const [systemArmed, setSystemArmed] = useState(false);
    const [camStatus, setCamStatus] = useState({});

    // Grid Virtualization & Focus Policy
    const [visibleCams, setVisibleCams] = useState(new Set());
    const [focusedCam, setFocusedCam] = useState(null);
    const MAX_ACTIVE_STREAMS = 16;

    // Keyboard Shortcuts (Esc to exit fullscreen)
    useEffect(() => {
        const handleKeys = (e) => {
            if (e.key === 'Escape' && selectedCam) {
                setSelectedCam(null);
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [selectedCam]);

    // Default visible cams on load
    useEffect(() => {
        if (cams.length > 0 && visibleCams.size === 0) {
            const initial = new Set();
            cams.slice(0, gridSize).forEach(c => initial.add(c.id));
            setVisibleCams(initial);
        }
    }, [cams, gridSize]);

    // Poll Arming Status
    useEffect(() => {
        const checkArming = () => {
            API.get("arming-state/state").then(res => {
                const statusMap = {};
                setSystemArmed(!!res.data.armed);
                if (res.data && res.data.cameras) {
                    Object.keys(res.data.cameras).forEach(camId => {
                        statusMap[camId] = res.data.cameras[camId].armed;
                    });
                }
                if (!res.data.armed) {
                    setArmingStatus({});
                } else {
                    setArmingStatus(statusMap);
                }
            }).catch(err => {
                setArmingStatus({});
                setSystemArmed(false);
            });
        };
        checkArming();
        const interval = setInterval(checkArming, 5000);
        return () => clearInterval(interval);
    }, []);

    // Poll Config & Status (Standard API)
    useEffect(() => {
        const fetchCams = () => API.get("cameras/config").then(res => setCams(res.data)).catch(console.error);
        fetchCams();

        const checkStatus = () => {
            API.get("status").then(res => {
                const isOnline = res.data.online === true || res.data.status === "Connected" || res.data.system?.uptime > 0;
                setStatus(isOnline ? "Connected" : "Disconnected");
                if (res.data.cameras) {
                    const map = {};
                    res.data.cameras.forEach(c => map[c.id] = { ...c, connected: c.status === "ONLINE" });
                    setCamStatus(map);
                }
            }).catch(() => setStatus("Disconnected"));
        };
        checkStatus();

        const i1 = setInterval(fetchCams, 10000);
        const i2 = setInterval(checkStatus, 3000);
        return () => { clearInterval(i1); clearInterval(i2); };
    }, []);

    // DSS Event Listener (WebSocket for Arming State)
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const dssWsUrl = `${protocol}//${window.location.hostname}:8090`;
        let ws;
        let reconnectTimer;
        const connect = () => {
            ws = new WebSocket(dssWsUrl);
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'ARMING_STATE_CHANGED') {
                        setSystemArmed(msg.armed);
                        if (!msg.armed) setArmingStatus({});
                    }
                } catch (e) { }
            };
            ws.onclose = () => {
                reconnectTimer = setTimeout(connect, 3000);
            };
        };
        connect();
        return () => {
            if (ws) ws.close();
            clearTimeout(reconnectTimer);
        };
    }, []);

    // IntersectionObserver for Virtualization (Only active when grid visible)
    useEffect(() => {
        if (cams.length === 0 || selectedCam) return;

        const observer = new IntersectionObserver((entries) => {
            setVisibleCams(prev => {
                const next = new Set(prev);
                entries.forEach(entry => {
                    const id = entry.target.getAttribute('data-cam-id');
                    if (entry.isIntersecting) {
                        next.add(id);
                    } else if (id) {
                        next.delete(id);
                    }
                });
                return next;
            });
        }, { threshold: 0.1, rootMargin: '200px' });

        const cards = document.querySelectorAll('[data-cam-id]');
        cards.forEach(card => observer.observe(card));

        return () => observer.disconnect();
    }, [cams, gridSize, selectedCam]);

    // QUALITY POLICY - ANTIGRAVITY: --pause-background-streams true
    const getQualityForCam = (camId, idx) => {
        if (selectedCam) {
            return (selectedCam.id === camId) ? 'hd' : 'off';
        }

        const isVisible = visibleCams.has(camId) || (idx < 4);
        if (!isVisible) return 'off';
        if (focusedCam === camId) return 'hd';
        if (visibleCams.size > MAX_ACTIVE_STREAMS) return 'low';
        return 'sub';
    };

    // Grid Layout Config
    const getGridConfig = () => {
        switch (gridSize) {
            case 1: return { cols: "1fr", rows: "1fr" };
            case 4: return { cols: "repeat(2, 1fr)", rows: "repeat(2, 1fr)" };
            case 9: return { cols: "repeat(3, 1fr)", rows: "repeat(3, 1fr)" };
            case 16: return { cols: "repeat(4, 1fr)", rows: "repeat(4, 1fr)" };
            case 25: return { cols: "repeat(5, 1fr)", rows: "repeat(5, 1fr)" };
            case 32: return { cols: "repeat(8, 1fr)", rows: "repeat(4, 1fr)" };
            default:
                const cols = Math.ceil(Math.sqrt(gridSize));
                const rows = Math.ceil(gridSize / cols);
                return { cols: `repeat(${cols}, 1fr)`, rows: `repeat(${rows}, 1fr)` };
        }
    };

    const grid = getGridConfig();
    const capacity = gridSize;

    return (
        <div className="live-page" style={{ width: "100%", height: "100%", background: "#000", color: colors.text, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>

            {/* TOOLBAR - Hidden in Fullscreen Overlay Mode */}
            {!selectedCam && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#050505", borderBottom: "1px solid #111", height: "30px", zIndex: 100 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                        <div style={{ fontWeight: "800", fontSize: 10, color: "#999", display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: status === "Connected" ? "#2ecc71" : "#e74c3c" }}></div>
                            MONITORIZARE LIVE
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                            {[1, 4, 9, 16, 25, 32].map(num => (
                                <button key={num} onClick={() => setGridSize(num)} style={{ border: "1px solid #1a1a1a", background: gridSize === num ? "#007acc" : "#0a0a0a", color: "#fff", width: 28, height: 18, cursor: "pointer", fontSize: 9, borderRadius: 2 }}>{num}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* FULLSCREEN OVERLAY LAYER - ANTIGRAVITY: --fullscreen-mode overlay, --fullscreen-z-index 9999 */}
            {selectedCam && (
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                    background: "#000", zIndex: 9999, display: "flex"
                }}>
                    <CameraCard
                        cam={selectedCam}
                        isMaximized={true}
                        isHidden={false}
                        onMaximise={() => setSelectedCam(null)}
                        isArmed={armingStatus[selectedCam.id] !== undefined ? armingStatus[selectedCam.id] : systemArmed}
                        health={camStatus[selectedCam.id]}
                        isReady={camStatus[selectedCam.id]?.connected === true}
                        isDegraded={(armingStatus[selectedCam.id] !== undefined ? armingStatus[selectedCam.id] : systemArmed) && camStatus[selectedCam.id]?.connected !== true}
                        quality="hd"
                        isFocused={true}
                    />
                </div>
            )}

            {/* GRID LAYER - ANTIGRAVITY: --grid-visibility hidden when fullscreen */}
            <div style={{
                display: "grid", gridTemplateColumns: grid.cols, gridTemplateRows: grid.rows, gap: 2,
                flex: 1, background: "#000", padding: 2, overflowY: "auto", overflowX: "hidden",
                visibility: selectedCam ? "hidden" : "visible",
                pointerEvents: selectedCam ? "none" : "auto"
            }}>
                {cams.map((cam, idx) => {
                    const isVisibleSlot = (idx < capacity);
                    if (!isVisibleSlot) return null;
                    const quality = getQualityForCam(cam.id, idx);

                    return (
                        <div key={cam.id} data-cam-id={cam.id}
                            style={{
                                position: "relative", width: "100%", height: "100%",
                                minHeight: gridSize > 16 ? "100px" : "150px",
                                background: "#000", overflow: "hidden"
                            }}
                            onMouseEnter={() => setFocusedCam(cam.id)}
                            onMouseLeave={() => setFocusedCam(null)}
                        >
                            <CameraCard
                                cam={cam}
                                isMaximized={false}
                                isHidden={!isVisibleSlot}
                                onMaximise={(c) => setSelectedCam(c)}
                                isArmed={armingStatus[cam.id] !== undefined ? armingStatus[cam.id] : systemArmed}
                                health={camStatus[cam.id]}
                                isReady={camStatus[cam.id]?.connected === true}
                                isDegraded={(armingStatus[cam.id] !== undefined ? armingStatus[cam.id] : systemArmed) && camStatus[cam.id]?.connected !== true}
                                quality={quality}
                                isFocused={focusedCam === cam.id}
                            />
                        </div>
                    );
                })}
            </div>

            <style>{`
                video, img { width: 100% !important; height: 100% !important; object-fit: fill !important; background: #000; }
                ::-webkit-scrollbar { width: 2px; }
                ::-webkit-scrollbar-thumb { background: #111; }
            `}</style>
        </div>
    );
}
