import React, { useState, useEffect } from "react";
import { API } from "../../api";
import { RefreshCw, SettingsIcon, Trash } from "../../components/Icons";

const styles = {
    btnPrimary: { marginRight: 10, padding: "6px 20px", background: "#007acc", color: "white", border: "none", borderRadius: 2, fontSize: 13, cursor: "pointer", fontWeight: "bold" },
    th: { textAlign: "left", borderBottom: "1px solid #444", padding: 8, color: "#ccc" },
    td: { padding: 8, borderBottom: "1px solid #333", color: "#ddd" },
};

export function SystemLogsSection() {
    const [logs, setLogs] = useState([]);

    const parseLogs = (data) => {
        if (!data) return [];
        let parsed = data;
        if (typeof data === 'string') {
            try { parsed = JSON.parse(data); } catch (e) { return []; }
        }
        if (!Array.isArray(parsed)) return [];

        return parsed.map((evt, i) => {
            let name = evt?.type || "Unknown Event";
            if (evt?.detections?.length > 0) {
                const classes = [...new Set(evt.detections.map(d => d.class || d.label))];
                name = classes.join(", ").toUpperCase();
            }
            return {
                id: i + 1,
                rawId: evt.id || i,
                name,
                camera: evt.camera_name || evt.cameraId || "N/A",
                date: evt.timestamp ? new Date(evt.timestamp).toLocaleString() : "Unknown"
            };
        });
    };

    useEffect(() => {
        const fetchLogs = () => {
            API.get("/status/logs").then(res => setLogs(parseLogs(res.data))).catch(e => console.error(e));
        };
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column" }}>
            <h2 style={{ fontSize: 18, color: "#fff", marginBottom: 20 }}>System Logs</h2>
            <div style={{ flex: 1, background: "#1e1e1e", border: "1px solid #444", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: "#252526", position: "sticky", top: 0 }}>
                            <th style={{ ...styles.th, width: 60 }}>#</th>
                            <th style={styles.th}>Event Name</th>
                            <th style={styles.th}>Camera</th>
                            <th style={{ ...styles.th, width: 180 }}>Date & Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.rawId} style={{ borderBottom: "1px solid #333" }}>
                                <td style={{ ...styles.td, color: "#888", textAlign: "center" }}>{log.id}</td>
                                <td style={{ ...styles.td, fontWeight: "bold", color: "#4caf50" }}>{log.name}</td>
                                <td style={{ ...styles.td, color: "#ddd" }}>{log.camera}</td>
                                <td style={{ ...styles.td, color: "#aaa" }}>{log.date}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function ServiceMaintenanceSection({ services, onRestartStack }) {
    return (
        <div style={{ padding: 30, background: "#141414", minHeight: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30, background: "#252526", padding: "15px 25px", borderRadius: 8, border: "1px solid #333" }}>
                <h2 style={{ fontSize: 22, margin: 0, color: "#fff" }}>Service Maintenance</h2>
                <button onClick={onRestartStack} style={{ background: "#ff9800", color: "#111", border: "none", padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                    RESTART STACK
                </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 15, textTransform: "uppercase" }}>Critical Services</div>
                    {services.map(s => (
                        <div key={s.name} style={{ background: "#1e1e1e", padding: 20, borderRadius: 8, marginBottom: 15, borderLeft: `4px solid ${s.status === "Running" ? "#4caf50" : "#f44336"}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: "bold", color: "#ddd" }}>{s.label}</div>
                                    <div style={{ fontSize: 12, color: "#777" }}>{s.details}</div>
                                </div>
                                <div style={{ background: s.status === "Running" ? "rgba(76,175,80,0.1)" : "rgba(244,67,54,0.1)", color: s.status === "Running" ? "#4caf50" : "#f44336", padding: "4px 10px", borderRadius: 20, fontSize: 11 }}>{s.status}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 15, textTransform: "uppercase" }}>Diagnostics</div>
                    <div style={{ display: "grid", gap: 15 }}>
                        <div onClick={() => window.open(`http://${window.location.hostname}:1984/`, '_blank')} style={{ background: "#1e1e1e", padding: 20, borderRadius: 8, border: "1px solid #333", cursor: "pointer" }}>
                            <div style={{ fontWeight: "bold", color: "#eee" }}>Go2RTC Dashboard</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function RebootSection() {
    const handleReboot = async () => {
        if (!window.confirm("ATENTIUNE! Sigur reporniti serverul?")) return;
        try {
            await API.post("/status/reboot");
            alert("Comanda executata.");
        } catch (e) { alert("Eroare: " + e.message); }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Mentenanta - Server</h2>
            <div style={{ background: "#252526", padding: 25, border: "1px solid #444", maxWidth: 600 }}>
                <h3 style={{ color: "#f44336" }}>Reboot Server</h3>
                <p style={{ color: "#aaa" }}>Aceasta actiune va reporni complet sistemul hardware.</p>
                <button style={{ ...styles.btnPrimary, background: "#f44336" }} onClick={handleReboot}>Reboot Complet Server</button>
            </div>
        </div>
    );
}

export function TimeSettingsSection() {
    const [timeData, setTimeData] = useState(null);
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState("");

    const refresh = () => API.get('/system/time').then(res => {
        setTimeData(res.data);
        if (res.data?.raw?.['Time zone']) {
            // format: "Europe/Bucharest (EET, +0200)"
            const simple = res.data.raw['Time zone'].split(' ')[0];
            setSelectedZone(prev => prev || simple);
        }
    }).catch(console.error);

    useEffect(() => {
        refresh();
        API.get('/system/timezones')
            .then(res => {
                if (Array.isArray(res.data)) setZones(res.data);
            })
            .catch(() => {
                // Fallback if backend API is older
                setZones(["Europe/Bucharest", "Europe/London", "Europe/Paris", "Europe/Berlin", "UTC", "America/New_York", "Asia/Tokyo"]);
            });
    }, []);

    const setZone = async (z) => {
        if (!window.confirm(`Set timezone to ${z}?`)) return;
        try {
            await API.post('/system/timezone', { timezone: z });
            alert("Timezone updated! Refreshing system info...");
            setTimeout(refresh, 2000);
        } catch (e) { alert("Error: " + (e.response?.data || e.message)); }
    };

    if (!timeData) return <div style={{ padding: 20, color: "#aaa" }}>Loading time data...</div>;

    const { raw } = timeData;

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Setari Data si Ora Sistem</h2>
            <div style={{ background: "#252526", padding: 25, border: "1px solid #444", maxWidth: 600 }}>
                <div style={{ color: "#ccc", marginBottom: 15, fontSize: 13, lineHeight: "1.6" }}>
                    <div>Timezone Server: <span style={{ color: "#fff", fontWeight: "bold" }}>{raw?.['Time zone'] || 'Unknown'}</span></div>
                    <div style={{ marginTop: 5 }}>Ora Locala Server: <span style={{ color: "#00e676", fontWeight: "bold" }}>{raw?.['Local time'] || 'Unknown'}</span></div>
                    <div style={{ marginTop: 5 }}>Ora UTC: {raw?.['Universal time']}</div>
                </div>

                <div style={{ marginTop: 25, borderTop: "1px solid #333", paddingTop: 20 }}>
                    <h3 style={{ color: "#007acc", fontSize: 14, textTransform: "uppercase", marginBottom: 10 }}>Selectare Fus Orar</h3>
                    <div style={{ display: "flex", gap: 10 }}>
                        <select
                            value={selectedZone}
                            onChange={e => setSelectedZone(e.target.value)}
                            style={{ padding: "8px", borderRadius: 4, background: "#333", color: "#fff", border: "1px solid #555", flex: 1 }}
                        >
                            <option value="">-- Select Timezone --</option>
                            {zones.map(z => <option key={z} value={z}>{z}</option>)}
                        </select>
                        <button
                            onClick={() => setZone(selectedZone)}
                            disabled={!selectedZone}
                            style={{ padding: "8px 16px", background: "#007acc", color: "white", border: "none", borderRadius: 4, cursor: "pointer", opacity: selectedZone ? 1 : 0.5 }}
                        >
                            Salveaza
                        </button>
                    </div>

                    <div style={{ marginTop: 20 }}>
                        <button onClick={() => setZone('Europe/Bucharest')} style={{ background: "transparent", border: "1px solid #4caf50", color: "#4caf50", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                            Setare Rapida: Romania (Europe/Bucharest)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
