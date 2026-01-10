import React, { useState, useEffect } from "react";
import API from "../api";
import { manufacturers as DB_MANUFACTURERS } from "../data/cameraDB";
import { Trash } from "../components/Icons"; // Assuming standard icon exist or I use text

const theme = {
    bg: "#121212",
    panel: "#1e1e1e",
    border: "#333",
    accent: "#2196f3",
    success: "#4caf50",
    error: "#f44336",
    text: "#e0e0e0",
    textDim: "#aaa"
};

export default function CameraWizard({ onFinish, onUpdate, onOpenSetup }) {
    const [scannedDevices, setScannedDevices] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [savedCameras, setSavedCameras] = useState([]);

    useEffect(() => { loadSaved(); }, []);

    const loadSaved = () => {
        API.get("cameras/config").then(res => setSavedCameras(res.data)).catch(console.error);
    };

    const startScan = async () => {
        setScanning(true);
        setScannedDevices([]);
        try {
            const res = await API.post("discovery/scan", {}, { timeout: 60000 });
            if (Array.isArray(res.data)) setScannedDevices(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setScanning(false);
        }
    };

    const handleSelectDevice = (dev) => {
        if (onOpenSetup) {
            onOpenSetup({
                ip: dev.ip,
                user: "admin",
                pass: "",
                manufacturer: dev.manufacturer || "Auto-Detect"
            });
        }
    };

    const handleManualAdd = () => {
        if (onOpenSetup) {
            onOpenSetup({
                ip: "",
                user: "admin",
                pass: "",
                manufacturer: ""
            });
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this camera?")) return;

        try {
            await API.delete(`cameras/${id}`);
            loadSaved();
            if (onUpdate) onUpdate();
        } catch (e) {
            alert("Delete failed: " + (e.response?.data?.error || e.message));
        }
    };

    return (
        <div style={{ display: "flex", height: "100%", background: theme.bg, color: theme.text, fontFamily: "Segoe UI, sans-serif" }}>

            {/* SIDEBAR */}
            <div style={{ width: 320, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", background: "#181818" }}>
                <div style={{ padding: 15 }}>
                    <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 10, color: theme.accent }}>DISCOVERED DEVICES</div>
                    <button onClick={startScan} disabled={scanning} style={{ width: "100%", padding: "8px", background: scanning ? "#333" : theme.accent, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}>
                        {scanning ? "SCANNING..." : "SCAN NETWORK"}
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
                    {scannedDevices.map((dev, i) => {
                        const isAdded = savedCameras.some(c => c.ip === dev.ip);
                        return (
                            <div key={i} onClick={() => !isAdded && handleSelectDevice(dev)}
                                style={{
                                    padding: 10, marginBottom: 5, borderRadius: 4,
                                    background: isAdded ? "rgba(76, 175, 80, 0.1)" : "#252526",
                                    border: `1px solid ${isAdded ? theme.success : "#333"}`,
                                    cursor: isAdded ? "default" : "pointer", opacity: isAdded ? 0.6 : 1
                                }}
                            >
                                <div style={{ fontWeight: "bold" }}>{dev.ip}</div>
                                <div style={{ fontSize: 11, color: theme.textDim }}>{dev.manufacturer} {dev.model}</div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* MAIN FORM */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#121212" }}>
                <div style={{ width: "100%", maxWidth: 500, background: theme.panel, padding: 40, borderRadius: 8, border: `1px solid ${theme.border}`, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", textAlign: "center" }}>
                    <h2 style={{ margin: "0 0 20px 0", color: "#fff" }}>ADD CAMERA</h2>
                    <p style={{ color: "#aaa", marginBottom: 30 }}>
                        Select a discovered device from the list on the left<br />
                        or manually configure a new connection.
                    </p>

                    <button onClick={handleManualAdd} style={{ padding: "15px 30px", background: theme.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: 16, fontWeight: "bold", cursor: "pointer", width: "100%" }}>
                        MANUAL ADD (CONNECTION SETUP)
                    </button>

                    <div style={{ marginTop: 20, fontSize: 12, color: "#666" }}>
                        Opens the Advanced Connection Setup Dialog
                    </div>
                </div>

                {/* ACTIVE CAMERAS LIST WITH DELETE */}
                <div style={{ marginTop: 40, width: "100%", maxWidth: 800 }}>
                    <h3 style={{ color: theme.textDim, fontSize: 13, textTransform: "uppercase", borderBottom: `1px solid ${theme.border}`, paddingBottom: 5 }}>Active Cameras ({savedCameras.length})</h3>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "10px 0" }}>
                        {savedCameras.map(c => (
                            <div key={c.id} style={{
                                minWidth: 160, padding: 12, background: "#222", border: `1px solid ${theme.border}`, borderRadius: 4, fontSize: 12, position: "relative"
                            }}>
                                <button
                                    onClick={(e) => handleDelete(c.id, e)}
                                    title="Delete Camera"
                                    style={{
                                        position: "absolute", top: 5, right: 5, background: "transparent", border: "none", color: "#f44336", cursor: "pointer", fontWeight: "bold"
                                    }}
                                >
                                    ✕
                                </button>
                                <div style={{ fontWeight: "bold", color: "#fff", marginBottom: 3, paddingRight: 20 }}>{c.ip}</div>
                                <div style={{ color: theme.textDim }}>{c.manufacturer}</div>
                                <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.connected ? theme.success : theme.error }}></div>
                                    <span style={{ color: c.connected ? theme.success : theme.error }}>{c.connected ? "Online" : "Offline"}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

const labelStyle = { display: "block", marginBottom: 5, color: "#aaa", fontSize: 12, fontWeight: "600" };
const inputStyle = { width: "100%", padding: "10px", background: "#252526", border: "1px solid #444", color: "#fff", borderRadius: 4, boxSizing: "border-box" };
