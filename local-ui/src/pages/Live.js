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
    const [systemArmed, setSystemArmed] = useState(false); // EXEC-31: Global fallback
    const [camStatus, setCamStatus] = useState({});

    // Poll Arming Status (EXEC-31: Live Truth)
    useEffect(() => {
        const checkArming = () => {
            API.get("arming-state/state").then(res => {
                const statusMap = {};
                // EXEC-31: Set Global State
                setSystemArmed(!!res.data.armed);

                if (res.data && res.data.cameras) {
                    Object.keys(res.data.cameras).forEach(camId => {
                        // EXEC-31: Map contains true armed state (system armed + camera assigned)
                        statusMap[camId] = res.data.cameras[camId].armed;
                    });
                }
                // Fail-safe: if global armed is false, clear all
                if (!res.data.armed) {
                    setArmingStatus({});
                } else {
                    setArmingStatus(statusMap);
                }
            }).catch(err => {
                console.warn("[Live] Failed to fetch arming state", err);
                setArmingStatus({}); // Fail-safe: Default to Disarmed
                setSystemArmed(false);
            });
        };
        checkArming();
        const interval = setInterval(checkArming, 5000);
        return () => clearInterval(interval);
    }, []);

    // Poll Config & Status
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

    // EXEC-32: Real-time Event Listener (WebSocket)
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Assuming the API server exposes port 8090, or we proxy. 
        // Direct port 8090 access usually requires firewall rule, but assuming local LAN access.
        const wsUrl = `${protocol}//${window.location.hostname}:8090`;

        let ws;
        let reconnectTimer;

        const connect = () => {
            console.log("[Live] Connecting to Event Hub:", wsUrl);
            ws = new WebSocket(wsUrl);

            ws.onopen = () => console.log("[Live] WS Connected");

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'ARMING_STATE_CHANGED') {
                        console.log("[Live] ⚡ Real-Time Arming Update:", msg.armed);
                        setSystemArmed(msg.armed);

                        // Optimistically clear specific statuses if disarmed
                        if (!msg.armed) setArmingStatus({});
                    }
                } catch (e) { console.error("[Live] WS Parse Error", e); }
            };

            ws.onclose = () => {
                console.log("[Live] WS Disconnected, retrying...");
                reconnectTimer = setTimeout(connect, 3000);
            };

            ws.onerror = (e) => console.log("[Live] WS Error (Port 8090 reachable?)");
        };

        connect();

        return () => {
            if (ws) ws.close();
            clearTimeout(reconnectTimer);
        };
    }, []);

    // NEW: Server Time Sync
    const [currentTime, setCurrentTime] = useState(new Date());
    const [serverTimezone, setServerTimezone] = useState(null);

    useEffect(() => {
        API.get('/system/time').then(res => {
            if (res.data?.raw?.['Time zone']) setServerTimezone(res.data.raw['Time zone'].split(' ')[0]);
        }).catch(() => { });

        const i = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(i);
    }, []);

    const formatTime = (date) => {
        if (!date) return "";
        const ts = date instanceof Date ? date.getTime() : date;
        return formatLocalTime(ts, serverTimezone);
    };

    const handleUpdateCam = async (camId, changes) => {
        const newCams = cams.map(c => c.id === camId ? { ...c, ...changes } : c);
        setCams(newCams);
        try { await API.post("cameras/config", newCams); } catch (e) { console.error(e); }
    };

    // Grid Logic
    const getGridConfig = () => {
        if (selectedCam) return { cols: "1fr", rows: "1fr" };
        switch (gridSize) {
            case 1: return { cols: "1fr", rows: "1fr" };
            case 4: return { cols: "repeat(2, 1fr)", rows: "repeat(2, 1fr)" };
            case 6: return { cols: "repeat(3, 1fr)", rows: "repeat(2, 1fr)" };
            case 8: return { cols: "repeat(4, 1fr)", rows: "repeat(2, 1fr)" }; // Trassir 8-view (4x2 usually or 1 big + 7 small) - keeping symetric for now
            case 9: return { cols: "repeat(3, 1fr)", rows: "repeat(3, 1fr)" };
            case 16: return { cols: "repeat(4, 1fr)", rows: "repeat(4, 1fr)" };
            case 24: return { cols: "repeat(6, 1fr)", rows: "repeat(4, 1fr)" };
            case 25: return { cols: "repeat(5, 1fr)", rows: "repeat(5, 1fr)" };
            case 32: return { cols: "repeat(8, 1fr)", rows: "repeat(4, 1fr)" };
            default:
                const cols = Math.ceil(Math.sqrt(gridSize));
                const rows = Math.ceil(gridSize / cols);
                return { cols: `repeat(${cols}, 1fr)`, rows: `repeat(${rows}, 1fr)` };
        }
    };

    const grid = getGridConfig();
    const capacity = selectedCam ? 1 : gridSize;

    return (
        <div className="live-page" style={{
            width: "100%", height: "100%", background: "#0d0d0d", color: colors.text,
            overflow: "hidden", display: "flex", flexDirection: "column"
        }}>

            {/* TOOLBAR */}
            {!selectedCam && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#1a1a1a", borderBottom: "1px solid #333", height: "32px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                        <div style={{ fontWeight: "bold", fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: status === "Connected" ? "#4caf50" : "#f44336" }}></div>
                            LIVE VIEW
                            {/* EXEC-31: Global Armed Indicator */}
                            {systemArmed && <span style={{ color: '#e74c3c', marginLeft: 10, fontSize: 11 }}>● SYSTEM ARMED</span>}
                        </div>
                        <div style={{ display: "flex", gap: 1 }}>
                            {[1, 4, 6, 8, 9, 12, 16, 24, 32].map(num => (
                                <button key={num} onClick={() => setGridSize(num)}
                                    style={{
                                        border: "none", background: gridSize === num ? "#007acc" : "#333",
                                        color: "#fff", width: 26, height: 20, cursor: "pointer", fontSize: 10,
                                        fontWeight: gridSize === num ? "bold" : "normal", marginRight: 1
                                    }}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>{formatTime(currentTime)}</div>
                </div>
            )}

            {/* GRID AREA */}
            <div style={{
                display: "grid",
                gridTemplateColumns: grid.cols,
                gridTemplateRows: grid.rows,
                gap: selectedCam ? 0 : 2,
                flex: 1,
                background: "#000",
                padding: selectedCam ? 0 : 2,
                overflow: "hidden"
            }}>
                {cams.map((cam, idx) => {
                    // Logic: Keep card in DOM but hide if out of grid range, unless selected
                    const isVisible = selectedCam ? (cam.id === selectedCam.id) : (idx < capacity);

                    return (
                        <div key={cam.id} style={{
                            display: isVisible ? "flex" : "none",
                            flexDirection: "column",
                            position: "relative",
                            width: "100%",
                            height: "100%",
                            background: "#000",
                            overflow: "hidden",
                            border: "none",
                            padding: 0
                        }}
                            onDoubleClick={() => setSelectedCam(selectedCam ? null : cam)}
                        >
                            <CameraCard
                                cam={cam}
                                isMaximized={selectedCam && selectedCam.id === cam.id}
                                isHidden={!isVisible}
                                onUpdate={handleUpdateCam}
                                onMaximise={() => setSelectedCam(cam)}
                                // EXEC-31: Fallback to global systemArmed if specific status unknown
                                isArmed={armingStatus[cam.id] !== undefined ? armingStatus[cam.id] : systemArmed}
                                health={camStatus[cam.id]}
                            />
                        </div>
                    );
                })}

                {/* Empty Slots visualization */}
                {!selectedCam && Array.from({ length: Math.max(0, capacity - cams.length) }).map((_, i) => (
                    <div key={`empty-${i}`} style={{ background: "#111", border: "1px dashed #333", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "#333", fontSize: 10 }}>NO SIGNAL</span>
                    </div>
                ))}
            </div>

            {/* GLOBAL STYLES FOR VIDEO CONSTRAINTS */}
            <style>{`
                /* Robust Absolute Positioning for Video */
                .camera-card-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                }
                video, img, canvas, video-stream-mse {
                    position: absolute !important;
                    top: 0; left: 0;
                    width: 100% !important; 
                    height: 100% !important;
                    object-fit: contain !important;
                    background: #000;
                    border: none !important;
                }
                
                /* Scrollbar hide */
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: #111; }
                ::-webkit-scrollbar-thumb { background: #333; }
            `}</style>
        </div>
    );
}
