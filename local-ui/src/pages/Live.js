import React, { useEffect, useState } from "react";
import { API } from "../api";
import CameraCard from "../components/CameraCard";

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
    const [camStatus, setCamStatus] = useState({});

    // Poll Arming Status
    useEffect(() => {
        const checkArming = () => {
            API.get("arming/debug").then(res => {
                const statusMap = {};
                if (res.data && res.data.cameras) {
                    res.data.cameras.forEach(c => statusMap[c.id] = c.isArmed);
                }
                setArmingStatus(statusMap);
            }).catch(() => { });
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
                if (res.data.cameras) setCamStatus(res.data.cameras);
            }).catch(() => setStatus("Disconnected"));
        };
        checkStatus();

        const i1 = setInterval(fetchCams, 10000);
        const i2 = setInterval(checkStatus, 3000);
        return () => { clearInterval(i1); clearInterval(i2); };
    }, []);

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
            case 25: return { cols: "repeat(5, 1fr)", rows: "repeat(5, 1fr)" };
            default:
                const cols = Math.ceil(Math.sqrt(gridSize));
                const rows = Math.ceil(gridSize / cols);
                return { cols: `repeat(${cols}, 1fr)`, rows: `repeat(${rows}, 1fr)` };
        }
    };

    const grid = getGridConfig();
    const capacity = selectedCam ? 1 : gridSize;

    return (
        <div style={{
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
                        </div>
                        <div style={{ display: "flex", gap: 1 }}>
                            {[1, 4, 6, 8, 9, 16].map(num => (
                                <button key={num} onClick={() => setGridSize(num)}
                                    style={{
                                        border: "none", background: gridSize === num ? "#007acc" : "#333",
                                        color: "#fff", width: 24, height: 20, cursor: "pointer", fontSize: 11,
                                        fontWeight: gridSize === num ? "bold" : "normal", marginRight: 1
                                    }}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>{new Date().toLocaleTimeString()}</div>
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
                            display: isVisible ? "block" : "none", // Using none to completely remove from grid flow layout
                            position: "relative",
                            width: "100%",
                            height: "100%",
                            background: "#000",
                            overflow: "hidden",
                            border: selectedCam ? "none" : "1px solid #222"
                        }}
                            onDoubleClick={() => setSelectedCam(selectedCam ? null : cam)}
                        >
                            <CameraCard
                                cam={cam}
                                isMaximized={selectedCam && selectedCam.id === cam.id}
                                isHidden={!isVisible}
                                onUpdate={handleUpdateCam}
                                onMaximise={() => setSelectedCam(cam)}
                                isArmed={armingStatus[cam.id]}
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

            {/* GLOBAL STYLES FOR VIDEO ASPECT RATIO FIX */}
            <style>{`
                video, canvas {
                    object-fit: contain !important; 
                    width: 100% !important; 
                    height: 100% !important;
                    background: #000;
                }
                /* Go2RTC Player fixes */
                video-stream-mse {
                    display: block;
                    width: 100%;
                    height: 100%;
                }
                /* Scrollbar hide */
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: #111; }
                ::-webkit-scrollbar-thumb { background: #333; }
            `}</style>
        </div>
    );
}
