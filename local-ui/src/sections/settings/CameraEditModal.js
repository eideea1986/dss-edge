import React, { useState } from "react";
import { API } from "../../api";
import { styles, colors } from "../../theme";

export default function CameraEditModal({
    editCam, setEditCam, manufacturers, models, caps, onClose, onSave
}) {
    const [probing, setProbing] = useState(false);
    const [probeResults, setProbeResults] = useState(null);

    const handleProbe = async () => {
        setProbing(true);
        try {
            const res = await API.post("cameras/probe", editCam);
            setProbeResults(res.data);
            if (res.data.manufacturer) setEditCam(prev => ({ ...prev, manufacturer: res.data.manufacturer }));
            if (res.data.model) setEditCam(prev => ({ ...prev, model: res.data.model }));
        } catch (e) {
            alert("Probe Failed: " + (e.response?.data?.error || e.message));
        } finally {
            setProbing(false);
        }
    };

    return (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "#252526", width: 600, borderRadius: 6, border: "1px solid #444", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
                <div style={{ background: "#333", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #444" }}>
                    <h3 style={{ margin: 0, color: "#fff", fontSize: 16 }}>Connection Setup: {editCam.ip}</h3>
                    <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 20 }}>&times;</button>
                </div>

                <div style={{ padding: 25, overflowY: "auto" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                        <div><label style={styles.label}>IP Address</label><input style={{ ...styles.input, width: "100%" }} value={editCam.ip} onChange={e => setEditCam({ ...editCam, ip: e.target.value })} /></div>
                        <div><label style={styles.label}>Control Port</label><input style={{ ...styles.input, width: "100%" }} value={editCam.port} onChange={e => setEditCam({ ...editCam, port: e.target.value })} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                        <div><label style={styles.label}>User</label><input style={{ ...styles.input, width: "100%" }} value={editCam.user} onChange={e => setEditCam({ ...editCam, user: e.target.value })} /></div>
                        <div><label style={styles.label}>Password</label><input type="password" style={{ ...styles.input, width: "100%" }} value={editCam.pass} onChange={e => setEditCam({ ...editCam, pass: e.target.value })} /></div>
                    </div>
                    <div style={{ marginBottom: 20 }}>
                        <label style={styles.label}>Manufacturer</label>
                        <select style={{ ...styles.input, width: "100%", maxWidth: "100%" }} value={editCam.manufacturer} onChange={e => setEditCam({ ...editCam, manufacturer: e.target.value })}>
                            <option value="">Select...</option>
                            {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>

                    <div style={{ border: "1px solid #444", padding: 15, borderRadius: 4, background: "#1e1e1e" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                            <span style={{ fontWeight: "bold", fontSize: 13, color: "#ddd" }}>Auto-Discovery & Probing</span>
                            <button onClick={handleProbe} disabled={probing} style={{ background: colors.info, color: "#fff", border: "none", padding: "4px 12px", borderRadius: 2, cursor: "pointer", fontSize: 12 }}>
                                {probing ? "Probing..." : "Test Connection & Find Streams"}
                            </button>
                        </div>
                        {probeResults && (
                            <div style={{ fontSize: 12, color: "#4caf50", background: "rgba(76,175,80,0.1)", padding: 8, borderRadius: 2 }}>
                                <b>Probe Success!</b> Camera detected as {probeResults.model}. Found {probeResults.channels?.length} potential channel(s).
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ background: "#333", padding: "15px 20px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid #444" }}>
                    <button style={styles.btnToolbar} onClick={onClose}>Anuleaza</button>
                    <button style={styles.btnPrimary} onClick={onSave}>Salveaza Configurația</button>
                </div>
            </div>
        </div>
    );
}
