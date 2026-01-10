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

export default function CameraWizard({ onFinish, onUpdate }) {
    const [scannedDevices, setScannedDevices] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [form, setForm] = useState({
        ip: "",
        user: "admin",
        pass: "",
        manufacturer: "Auto-Detect"
    });

    const [status, setStatus] = useState("IDLE");
    const [statusMsg, setStatusMsg] = useState("");
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
        setForm({
            ...form,
            ip: dev.ip,
            manufacturer: dev.manufacturer || "Auto-Detect"
        });
        setStatus("IDLE");
    };

    const handleConnectAndAdd = async () => {
        if (!form.ip || !form.user || !form.pass) {
            alert("Please enter IP, User and Password");
            return;
        }

        setStatus("BUSY");
        setStatusMsg("Connection in progress...");

        try {
            const res = await API.post("cameras/add", {
                ip: form.ip,
                user: form.user,
                pass: form.pass,
                manufacturer: form.manufacturer === "Auto-Detect" ? "" : form.manufacturer
            });

            if (res.data.status === 'ok') {
                setStatus("SUCCESS");
                setStatusMsg(`Success! Added via ${res.data.message || 'ONVIF'}`);
                loadSaved();
                if (onUpdate) onUpdate();
                setTimeout(() => {
                    setStatus("IDLE");
                    setForm(prev => ({ ...prev, ip: "", pass: "" }));
                }, 2000);
            }
        } catch (e) {
            setStatus("ERROR");
            setStatusMsg(e.response?.data?.error || e.message);
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
                <div style={{ width: "100%", maxWidth: 450, background: theme.panel, padding: 30, borderRadius: 8, border: `1px solid ${theme.border}`, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
                    <h2 style={{ margin: "0 0 20px 0", color: "#fff", textAlign: "center" }}>QUICK ADD CAMERA</h2>

                    {status !== "IDLE" && (
                        <div style={{
                            padding: 15, marginBottom: 20, borderRadius: 4, textAlign: "center", fontWeight: "bold",
                            background: status === "SUCCESS" ? "rgba(76, 175, 80, 0.2)" : (status === "ERROR" ? "rgba(244, 67, 54, 0.2)" : "rgba(33, 150, 243, 0.2)"),
                            color: status === "SUCCESS" ? theme.success : (status === "ERROR" ? theme.error : theme.accent),
                            border: `1px solid ${status === "SUCCESS" ? theme.success : (status === "ERROR" ? theme.error : theme.accent)}`
                        }}>
                            {statusMsg}
                        </div>
                    )}

                    <div style={{ display: "grid", gap: 15 }}>
                        <div><label style={labelStyle}>IP Address</label><input style={inputStyle} value={form.ip} onChange={e => setForm({ ...form, ip: e.target.value })} /></div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                            <div><label style={labelStyle}>Username</label><input style={inputStyle} value={form.user} onChange={e => setForm({ ...form, user: e.target.value })} /></div>
                            <div><label style={labelStyle}>Password</label><input type="password" style={inputStyle} value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })} /></div>
                        </div>
                        <button onClick={handleConnectAndAdd} disabled={status === "BUSY"} style={{ marginTop: 10, padding: 15, background: status === "BUSY" ? "#555" : theme.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: 16, fontWeight: "bold", cursor: "pointer" }}>
                            {status === "BUSY" ? "CONNECTING..." : "CONNECT & ADD"}
                        </button>
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
