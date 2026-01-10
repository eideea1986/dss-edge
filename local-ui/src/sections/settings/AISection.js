import React, { useState, useEffect } from "react";
import { API } from "../../api";
import { Save, RefreshCw, Cpu, Shield, AlertTriangle, Activity, Clock } from "lucide-react";

export function AISection() {
    const [activeTab, setActiveTab] = useState("antispam"); // or 'hub'
    const [cameras, setCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState("default");

    return (
        <div style={{ padding: 20, color: "#ccc" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #444", paddingBottom: 10 }}>
                <Cpu size={20} /> AI & Inteligență
            </h3>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 20, marginTop: 20, borderBottom: "1px solid #333" }}>
                <TabButton
                    label="Anti-Spam Intelligence"
                    icon={<Shield size={16} />}
                    active={activeTab === "antispam"}
                    onClick={() => setActiveTab("antispam")}
                />
                <TabButton
                    label="Hub Connection"
                    icon={<Activity size={16} />}
                    active={activeTab === "hub"}
                    onClick={() => setActiveTab("hub")}
                />
            </div>

            <div style={{ marginTop: 20 }}>
                {activeTab === "hub" && <HubSettings />}
                {activeTab === "antispam" && <AntiSpamSettings />}
            </div>
        </div>
    );
}

function TabButton({ label, icon, active, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                padding: "10px 0",
                cursor: "pointer",
                borderBottom: active ? "2px solid #2196f3" : "2px solid transparent",
                color: active ? "#fff" : "#888",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: active ? "bold" : "normal"
            }}
        >
            {icon} {label}
        </div>
    );
}

function AntiSpamSettings() {
    const [cameras, setCameras] = useState([]);
    const [selectedCam, setSelectedCam] = useState("default");
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        loadCameras();
        loadStats();
        // Poll stats
        const interval = setInterval(loadStats, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedCam) loadConfig(selectedCam);
    }, [selectedCam]);

    const loadCameras = async () => {
        try {
            const res = await API.get("/cameras");
            setCameras(res.data || []);
        } catch (e) { }
    };

    const loadStats = async () => {
        try {
            // Updated Path via proxy
            const res = await API.get("/ai-intelligence/api/stats");
            setStats(res.data);
        } catch (e) { }
    };

    const loadConfig = async (camId) => {
        setLoading(true);
        try {
            const res = await API.get(`/ai-intelligence/api/config/${camId}`);
            // If API returns global + camera config combined, great.
            // If specific camera config is empty, we might receive defaults.
            setConfig(res.data?.config || res.data);
        } catch (e) {
            console.error("Load Config Error", e);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await API.post(`/ai-intelligence/api/config/${selectedCam}`, config);
            alert("Setări salvate cu succes!");
        } catch (e) {
            alert("Eroare la salvare: " + e.message);
        }
        setSaving(false);
    };

    const updateFilter = (key, val) => {
        setConfig(prev => ({
            ...prev,
            false_detection_filter: { ...prev.false_detection_filter, [key]: val }
        }));
    };

    const updateEvent = (key, val) => {
        setConfig(prev => ({
            ...prev,
            event_manager: { ...prev.event_manager, [key]: val }
        }));
    };

    if (!config) return <div style={{ padding: 20 }}>Selectați o cameră sau așteptați încărcarea...</div>;

    return (
        <div>
            {/* Stats Header */}
            {stats && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                    <StatBox label="Tracked Objects" value={stats.tracked_objects} color="#2196f3" />
                    <StatBox label="Events Today" value={stats.events_today} color="#4caf50" />
                    <StatBox label="Ignored Zones" value={stats.false_zones} color="#ff9800" />
                    <StatBox label="Uptime" value={Math.round(stats.uptime_seconds / 60) + " min"} color="#9c27b0" />
                </div>
            )}

            {/* Camera Selector */}
            <div style={{ marginBottom: 20, background: "#222", padding: 15, borderRadius: 6 }}>
                <label style={{ marginRight: 10 }}>Select Camera:</label>
                <select
                    value={selectedCam}
                    onChange={e => setSelectedCam(e.target.value)}
                    style={{ padding: 8, borderRadius: 4, background: "#333", color: "#fff", border: "1px solid #444" }}
                >
                    <option value="default">Global Defaults (All Cameras)</option>
                    {cameras.map(c => (
                        <option key={c.id} value={c.id}>{c.name || c.ip} ({c.id})</option>
                    ))}
                </select>
            </div>

            {loading ? <div>Loading...</div> : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

                    {/* FILTER SETTINGS */}
                    <div style={{ background: "#1a1a1a", padding: 20, borderRadius: 8, border: "1px solid #333" }}>
                        <h4 style={{ margin: "0 0 15px 0", color: "#4caf50", display: "flex", alignItems: "center", gap: 8 }}>
                            <Shield size={18} /> False Detection Filter
                        </h4>

                        <div style={{ display: "flex", alignItems: "center", marginBottom: 15 }}>
                            <input type="checkbox" checked={config.false_detection_filter?.enabled} onChange={e => updateFilter("enabled", e.target.checked)} style={{ width: 18, height: 18 }} />
                            <label style={{ marginLeft: 10, fontWeight: "bold" }}>Enable Filter</label>
                        </div>

                        <div className="setting-row">
                            <label>Detect objects only on motion</label>
                            <input type="checkbox" checked={config.false_detection_filter?.motion_only} onChange={e => updateFilter("motion_only", e.target.checked)} />
                        </div>

                        <div className="setting-row">
                            <label>Ignore repeated detections (Anti-Wind/Rain)</label>
                            <input type="number" value={config.false_detection_filter?.detection_count_before_ignore} onChange={e => updateFilter("detection_count_before_ignore", parseInt(e.target.value))} style={{ width: 60 }} />
                        </div>
                        <p style={{ fontSize: 11, color: "#666", marginTop: -5, marginBottom: 10 }}>Ignore area after N detections without motion.</p>

                        <div className="setting-row">
                            <label>Stability Frames (Confirmation)</label>
                            <input type="number" value={config.false_detection_filter?.stability_frames} onChange={e => updateFilter("stability_frames", parseInt(e.target.value))} style={{ width: 60 }} />
                        </div>
                    </div>

                    {/* EVENT MANAGER */}
                    <div style={{ background: "#1a1a1a", padding: 20, borderRadius: 8, border: "1px solid #333" }}>
                        <h4 style={{ margin: "0 0 15px 0", color: "#2196f3", display: "flex", alignItems: "center", gap: 8 }}>
                            <AlertTriangle size={18} /> Anti-Spam & Events
                        </h4>

                        <div className="setting-row">
                            <label>Event Cooldown (seconds)</label>
                            <input type="number" value={config.event_manager?.cooldown_seconds} onChange={e => updateEvent("cooldown_seconds", parseInt(e.target.value))} style={{ width: 60 }} />
                        </div>
                        <p style={{ fontSize: 11, color: "#666", marginTop: -5, marginBottom: 10 }}>Don't send same event again for X seconds.</p>

                        <div className="setting-row">
                            <label>Min Displacement (Pixels)</label>
                            <input type="number" value={config.false_detection_filter?.min_displacement_pixels} onChange={e => updateFilter("min_displacement_pixels", parseInt(e.target.value))} style={{ width: 60 }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ background: "#2196f3", color: "white", padding: "10px 25px", border: "none", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}
                >
                    {saving ? <RefreshCw className="spin" /> : <Save size={18} />} Save Configuration
                </button>
            </div>

            <style>{`
                .setting-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #2a2a2a; }
                .setting-row label { font-size: 13px; color: #ccc; }
                .setting-row input[type="number"] { background: #222; border: 1px solid #444; color: #fff; padding: 4px; borderRadius: 4px; }
                .stat-box { background: #222; padding: 10px; borderRadius: 4px; text-align: center; border: 1px solid #333; }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

function StatBox({ label, value, color }) {
    return (
        <div className="stat-box" style={{ borderTop: `2px solid ${color}` }}>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#fff" }}>{value}</div>
            <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase" }}>{label}</div>
        </div>
    );
}

function HubSettings() {
    // Re-implementation of original Hub settings (simplified)
    const [config, setConfig] = useState({ hubUrl: "", enabled: true });

    useEffect(() => {
        API.get("/api/ai/config").then(res => setConfig(res.data)).catch(() => { });
    }, []);

    const save = () => {
        API.post("/api/ai/config", config).then(() => alert("Saved!")).catch(e => alert(e.message));
    };

    return (
        <div style={{ maxWidth: 500 }}>
            <h4>Hub Connection</h4>
            <div style={{ marginBottom: 15 }}>
                <label style={{ display: "block", marginBottom: 5 }}>Hub URL</label>
                <input style={{ width: "100%", padding: 8, background: "#222", color: "#fff", border: "1px solid #444" }} value={config.hubUrl || ""} onChange={e => setConfig({ ...config, hubUrl: e.target.value })} />
            </div>
            <button onClick={save} style={{ padding: "8px 16px", background: "#4caf50", color: "#fff", border: "none", cursor: "pointer" }}>Save Hub Settings</button>
        </div>
    );
}
