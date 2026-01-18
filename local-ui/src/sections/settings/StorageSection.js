import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Added
import { API } from "../../api";

const styles = {
    th: { textAlign: "left", borderBottom: "1px solid #444", padding: 8, color: "#ccc" },
    td: { padding: 8, borderBottom: "1px solid #333", color: "#ddd" },
    table: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13, background: "#252526" },
};

export function OrphansSection() {
    const [orphans, setOrphans] = useState(null);
    const navigate = useNavigate(); // Hook usage

    useEffect(() => {
        API.get("/cameras/orphans")
            .then(res => {
                if (Array.isArray(res.data)) {
                    setOrphans(res.data);
                } else {
                    setOrphans([]);
                }
            })
            .catch(() => setOrphans([]));
    }, []);

    const handleDelete = async (uuid) => {
        if (!window.confirm("Sunteti sigur ca doriti sa stergeti aceste inregistrari? Aceasta actiune este ireversibila.")) return;
        try {
            await API.delete("/cameras/orphans", { data: { uuid } });
            setOrphans(prev => Array.isArray(prev) ? prev.filter(o => o.uuid !== uuid) : []);
        } catch (e) {
            alert("Eroare la stergere: " + e.message);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Camere Sterse (Arhiva)</h2>
            <p style={{ color: "#aaa", fontSize: 13 }}>Aceste directoare contin inregistrari dar nu sunt legate de nicio camera activa.</p>
            <div style={{ background: "#252526", padding: 10, border: "1px solid #444" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13, background: "#252526" }}>
                    <thead><tr><th style={styles.th}>UUID Folder / Inregistrari</th><th style={styles.th}>Ultima Modificare</th><th style={styles.th}>Actiune</th></tr></thead>
                    <tbody>
                        {!orphans ? <tr><td colSpan="3" style={{ padding: 20, textAlign: "center" }}>Loading...</td></tr> :
                            (!Array.isArray(orphans) || orphans.length === 0) ? <tr><td colSpan="3" style={{ padding: 20, textAlign: "center", color: "#666" }}>No orphaned recordings found.</td></tr> :
                                orphans.map(o => (
                                    <tr key={o.uuid} style={{ background: "transparent", transition: "0.2s" }}>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                {o.uuid}
                                                <span
                                                    onClick={() => navigate(`/playback?camId=${o.uuid}`)} // Fixed navigation
                                                    style={{ color: "#81d4fa", cursor: "pointer", textDecoration: "underline", background: "rgba(33, 150, 243, 0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}
                                                >
                                                    Vezi Inregistrari [->]
                                                </span>
                                            </div>
                                        </td>
                                        <td style={styles.td}>{new Date(o.birthtime).toLocaleString()}</td>
                                        <td style={styles.td}>
                                            <button
                                                style={{ marginRight: 10, padding: "6px 15px", background: "#f44336", color: "#fff", border: "none", borderRadius: 2, fontSize: 12, cursor: "pointer" }}
                                                onClick={() => handleDelete(o.uuid)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function ArchiveSettingsSection({ cams }) {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        const fetchStats = () => {
            API.get("/recorder/status")
                .then(res => setStats(res.data))
                .catch(e => console.error("Failed to load recorder stats:", e));
        };
        fetchStats();
        const interval = setInterval(fetchStats, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes) => {
        if (!bytes) return "0.00 GB";
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Archive & Storage Management</h2>

            <div style={{ background: "#252526", padding: 20, border: "1px solid #444" }}>
                <h3 style={{ marginTop: 0, marginBottom: 15 }}>Archive Statistics</h3>
                {stats ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, fontSize: 14, color: "#ddd" }}>
                        <div style={{ background: "#1e1e1e", padding: 15, borderRadius: 4, border: "1px solid #333" }}>
                            <div style={{ fontSize: 12, color: "#888", marginBottom: 5 }}>Total Cameras</div>
                            <div style={{ fontSize: 24, fontWeight: "bold", color: "#4caf50" }}>{Object.keys(stats.cameras || {}).length}</div>
                        </div>
                        <div style={{ background: "#1e1e1e", padding: 15, borderRadius: 4, border: "1px solid #333" }}>
                            <div style={{ fontSize: 12, color: "#888", marginBottom: 5 }}>Recording</div>
                            <div style={{ fontSize: 24, fontWeight: "bold", color: "#2196f3" }}>{Object.values(stats.cameras || {}).filter(c => c.main || c.sub).length}</div>
                        </div>
                        <div style={{ background: "#1e1e1e", padding: 15, borderRadius: 4, border: "1px solid #333" }}>
                            <div style={{ fontSize: 12, color: "#888", marginBottom: 5 }}>Disk Usage</div>
                            <div style={{ fontSize: 24, fontWeight: "bold", color: stats.storage?.usedPercent > 80 ? "#f44336" : "#4caf50" }}>{stats.storage?.usedPercent || 0}%</div>
                        </div>
                        <div style={{ background: "#1e1e1e", padding: 15, borderRadius: 4, border: "1px solid #333" }}>
                            <div style={{ fontSize: 12, color: "#888", marginBottom: 5 }}>Available Space</div>
                            <div style={{ fontSize: 24, fontWeight: "bold", color: "#fff" }}>{stats.storage?.avail || "N/A"}</div>
                        </div>
                    </div>
                ) : (
                    <div style={{ color: "#666", textAlign: "center", padding: 40 }}>Loading statistics...</div>
                )}
            </div>
        </div>
    );
}
