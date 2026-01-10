import React, { useState, useEffect } from "react";
import { API } from "../api";
import WSPlayer from "../components/WSPlayer";

import CameraCard from "../components/CameraCard";
import Status from "./Status";
import { manufacturers as DB_MANUFACTURERS, getLogo } from "../data/cameraDB";
import { findModelConfig } from "../data/modelDB";

// Styles
const ScheduleEditor = () => <div style={{ padding: 20, color: 'orange' }}>ScheduleEditor Component Missing</div>;
const ArmingMatrix = () => <div style={{ padding: 20, color: 'orange' }}>ArmingMatrix Component Missing</div>;

const colors = {
    bg: "#1e1e1e",
    panel: "#252526",
    accent: "#007acc",
    text: "#cccccc",
    border: "#3e3e42"
};

const styles = {
    container: { height: "100%", display: "flex", flexDirection: "column", background: colors.bg, color: colors.text, fontFamily: "Segoe UI, sans-serif" },
    main: { flex: 1, display: "flex", overflow: "hidden" },
    sidebar: { width: 250, background: colors.panel, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", overflowY: "auto", height: "100%" },
    content: { flex: 1, display: "flex", flexDirection: "column", padding: 0, overflowY: "auto" },

    // Components
    btnToolbar: { marginRight: 10, padding: "6px 15px", background: "#333", color: "#ddd", border: "1px solid #444", borderRadius: 2, fontSize: 12, cursor: "pointer" },
    btnPrimary: { marginRight: 10, padding: "6px 20px", background: colors.accent, color: "white", border: "none", borderRadius: 2, fontSize: 13, cursor: "pointer", fontWeight: "bold" },

    // Cards for Manufacturers
    card: { background: "#333", border: "1px solid #444", padding: 15, borderRadius: 4, cursor: "pointer", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 80 },

    table: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13, background: "#252526" },
    th: { textAlign: "left", borderBottom: "1px solid #444", padding: 8, color: "#ccc" },
    td: { padding: 8, borderBottom: "1px solid #333", color: "#ddd" },
    inputTable: { background: "#444", border: "1px solid #555", color: "#fff", width: "100%", padding: 2 },

    // Network/System Section Styles
    sectionHeader: { borderBottom: "1px solid #444", paddingBottom: 10, marginBottom: 15, fontSize: 16, fontWeight: "bold", color: "#fff" },
    formGrid: { display: "grid", gridTemplateColumns: "150px 1fr", gap: 15, marginBottom: 10, alignItems: "center" },
    label: { color: "#aaa", fontSize: 13 },
    input: { background: "#333", border: "1px solid #555", color: "#fff", padding: 5, width: "100%", maxWidth: 300 },
    subItem: { padding: "5px 10px 5px 25px", cursor: "pointer", color: "#ddd", fontSize: 13 }
};

// Derived Data from Library
// const MANUFACTURERS = DB_MANUFACTURERS.map(m => m.name);
// const MODELS = DB_MANUFACTURERS.reduce((acc, m) => { acc[m.name] = m.models; return acc; }, {});

// Hook for fetching models
function useModels() {
    const [data, setData] = useState({ manufacturers: [], models: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.get("/models")
            .then(res => {
                const mfgList = res.data.manufacturers.map(m => m.name).sort();
                const modelMap = res.data.manufacturers.reduce((acc, m) => {
                    acc[m.name] = m.models;
                    return acc;
                }, {});

                // Fetch Capabilities
                API.get("/models/capabilities").then(capRes => {
                    setData({ manufacturers: mfgList, models: modelMap, capabilities: capRes.data || {} });
                    setLoading(false);
                }).catch(() => {
                    setData({ manufacturers: mfgList, models: modelMap, capabilities: {} });
                    setLoading(false);
                });
            })
            .catch(e => {
                console.error("Failed to load models", e);
                setLoading(false);
            });
    }, []);

    return { ...data, loading };
}

// Users Mock Data
const MOCK_USERS = [
    { id: 1, name: "Admin", icon: "👤", role: "admin" },
    { id: 2, name: "Operator", icon: "👮", role: "operator" },
    { id: 3, name: "Script", icon: "📜", role: "script" }
];

// Sub-component for auto-refreshing preview (Now uses WSPlayer for high-FPS)
function LivePreview({ camId }) {
    return (
        <WSPlayer
            camId={camId}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
    );
}

function SystemLogsView() {
    const [rawLogs, setRawLogs] = useState("");
    const [logs, setLogs] = useState([]);

    const parseLogs = (data) => {
        if (!data) return [];
        try {
            // Data is expected to be a JSON string of an array
            let parsed = data;
            if (typeof data === 'string') {
                try { parsed = JSON.parse(data); } catch (e) { return []; }
            }
            if (!Array.isArray(parsed)) return [];

            return parsed.map((evt, i) => {
                // Determine Event Name from detections
                let name = "Unknown Event";
                if (evt && evt.detections && Array.isArray(evt.detections) && evt.detections.length > 0) {
                    // Unique classes
                    const classes = [...new Set(evt.detections.map(d => d.class || d.label))];
                    name = classes.join(", ").toUpperCase();
                } else if (evt && evt.type) {
                    name = evt.type;
                }

                // Format Timestamp
                let dateStr = evt && evt.timestamp ? evt.timestamp : "Unknown";
                try {
                    if (evt.timestamp) {
                        const d = new Date(evt.timestamp);
                        dateStr = d.toLocaleString(); // Local format
                    }
                } catch (e) { }

                return {
                    id: parsed.length - i, // Reverse index #
                    rawId: i,
                    name: name,
                    camera: (evt && evt.cameraId) || "Unknown",
                    date: dateStr,
                    raw: evt
                };
            });
        } catch (e) {
            console.error("Log parse error", e);
            return [];
        }
    };

    useEffect(() => {
        const fetchLogs = () => {
            API.get("/status/logs").then(res => {
                const data = res.data;
                setRawLogs(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
                setLogs(parseLogs(data));
            }).catch(e => console.error(e));
        };
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, color: "#fff", margin: 0 }}>System Logs</h2>
                <button
                    style={{ ...styles.btnPrimary, background: "#ff9800", color: "#000" }}
                    onClick={async () => {
                        try {
                            const res = await API.post("/status/simulate-event");
                            alert("Result: " + JSON.stringify(res.data));
                        } catch (e) { alert("Error: " + e.message); }
                    }}
                >
                    🐞 Simulate AI Event
                </button>
            </div>
            <div style={{ flex: 1, background: "#1e1e1e", border: "1px solid #444", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: "#252526", position: "sticky", top: 0, zIndex: 1 }}>
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
                        {logs.length === 0 && <tr><td colSpan="4" style={{ padding: 20, textAlign: "center", color: "#666" }}>No events found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ROI Drawer Component
function CanvasROI({ points, onChange, width = 320, height = 180, readOnly = false }) {
    const canvasRef = React.useRef(null);
    const [draggingIdx, setDraggingIdx] = useState(-1);

    const getPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (width / rect.width),
            y: (e.clientY - rect.top) * (height / rect.height)
        };
    };

    const handleMouseDown = (e) => {
        if (readOnly) return;
        const pos = getPos(e);
        const idx = points.findIndex(p => Math.hypot(p[0] - pos.x, p[1] - pos.y) < 10);
        if (idx !== -1) {
            setDraggingIdx(idx);
        } else {
            onChange([...points, [pos.x, pos.y]]);
        }
    };

    const handleMouseMove = (e) => {
        if (readOnly) return;
        if (draggingIdx !== -1) {
            const pos = getPos(e);
            const newPoints = [...points];
            newPoints[draggingIdx] = [pos.x, pos.y];
            onChange(newPoints);
        }
    };

    const handleMouseUp = () => setDraggingIdx(-1);

    useEffect(() => {
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0, 0, width, height);

        // Style for ReadOnly vs Editing
        ctx.strokeStyle = readOnly ? "#ff0000" : "#00ff00"; // Red for saved/read-only to be visible
        ctx.lineWidth = readOnly ? 3 : 2;
        ctx.fillStyle = readOnly ? "rgba(255, 0, 0, 0.3)" : "rgba(0, 255, 0, 0.2)";

        if (points && points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            points.forEach(p => ctx.lineTo(p[0], p[1]));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw handles only if not readOnly
            if (!readOnly) {
                ctx.fillStyle = "#fff";
                points.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        }
    }, [points, width, height, readOnly]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ position: "absolute", top: 0, left: 0, zIndex: 10, cursor: readOnly ? "default" : (draggingIdx !== -1 ? "grabbing" : "crosshair") }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        />
    );
}

// Orphans View Component
function OrphansView() {
    const [orphans, setOrphans] = useState(null);
    useEffect(() => {
        API.get("/cameras/orphans").then(res => setOrphans(res.data)).catch(() => setOrphans([]));
    }, []);

    const handleDelete = async (uuid) => {
        if (!window.confirm("Sunteți sigur că doriți să ștergeți aceste înregistrări? Această acțiune este ireversibilă.")) return;
        try {
            await API.delete(`/cameras/orphans/${uuid}`);
            setOrphans(prev => prev.filter(o => o.uuid !== uuid));
        } catch (e) {
            alert("Eroare la ștergere: " + e.message);
        }
    };

    // Helper styles copy (since styles not available in sub-component unless we hoist or duplicate)
    // Actually we can access 'styles' if we define Styles inside Settings? No, styles is top level const. Good.
    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Camere Șterse (Arhivă)</h2>
            <p style={{ color: "#aaa", fontSize: 13 }}>Aceste directoare conțin înregistrări dar nu sunt legate de nicio cameră activă.</p>
            <div style={{ background: "#252526", padding: 10, border: "1px solid #444" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13, background: "#252526" }}>
                    <thead><tr><th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 8, color: "#ccc" }}>UUID Folder</th><th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 8, color: "#ccc" }}>Ultima Modificare</th><th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 8, color: "#ccc" }}>Acțiune</th></tr></thead>
                    <tbody>
                        {!orphans ? <tr><td colSpan="3" style={{ padding: 20, textAlign: "center" }}>Loading...</td></tr> :
                            orphans.length === 0 ? <tr><td colSpan="3" style={{ padding: 20, textAlign: "center", color: "#666" }}>No orphaned recordings found.</td></tr> :
                                orphans.map(o => (
                                    <tr key={o.uuid} style={{ background: "transparent", transition: "0.2s" }}>
                                        <td style={{ padding: 8, borderBottom: "1px solid #333", color: "#ddd" }}>{o.uuid}</td>
                                        <td style={{ padding: 8, borderBottom: "1px solid #333", color: "#ddd" }}>{new Date(o.birthtime).toLocaleString()}</td>
                                        <td style={{ padding: 8, borderBottom: "1px solid #333", color: "#ddd" }}>
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

// Sub-component for Dispatch Failover Settings (Fixes Hooks Violation)
function DispatchFailoverSettings({ netConfig, setNetConfig }) {
    const [localUrls, setLocalUrls] = useState([
        netConfig.dispatchUrl || "",
        "",
        ""
    ]);
    const [testStatus, setTestStatus] = useState("Idle"); // Idle, Testing, Connected, Failed

    // Load existing list on mount
    useEffect(() => {
        if (netConfig.dispatchUrls && Array.isArray(netConfig.dispatchUrls)) {
            const filled = [...netConfig.dispatchUrls];
            while (filled.length < 3) filled.push("");
            setLocalUrls(filled);
        } else if (netConfig.dispatchUrl) {
            // Fallback for legacy single URL
            setLocalUrls([netConfig.dispatchUrl, "", ""]);
        }
    }, [netConfig]);

    const updateUrl = (idx, val) => {
        const copy = [...localUrls];
        copy[idx] = val;
        setLocalUrls(copy);
    };

    const saveDispatchConfig = async () => {
        const validUrls = localUrls.filter(u => u && u.trim().length > 0);
        try {
            await API.post("/dispatch", { urls: validUrls });
            // Update parent state
            setNetConfig(prev => ({ ...prev, dispatchUrls: validUrls }));
            alert("Dispatch URLs Saved.");
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const testConnection = async () => {
        setTestStatus("Testing...");
        const validUrls = localUrls.filter(u => u && u.trim().length > 0);
        if (validUrls.length === 0) {
            alert("Please enter at least one URL");
            setTestStatus("Idle");
            return;
        }

        // Save first (optional, but good for sync)
        try {
            await API.post("/dispatch", { urls: validUrls });
        } catch (e) { console.error(e); }

        // Trigger sync/test endpoint
        try {
            const res = await API.post("/dispatch/sync");
            if (res.data.status === "ok") setTestStatus("Connected!");
            else setTestStatus("Failed");
        } catch (e) {
            setTestStatus("Failed: " + e.message);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Dispatch Server Failover</h2>
            <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 600 }}>
                <p style={{ color: "#aaa", fontSize: 13, marginBottom: 20 }}>
                    Configure up to 3 dispatch server URLs. The system will try them in order.
                </p>

                {[0, 1, 2].map(i => (
                    <div key={i} style={{ marginBottom: 15 }}>
                        <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Priority {i + 1} URL</label>
                        <input
                            style={{ ...styles.input, width: "100%" }}
                            value={localUrls[i]}
                            onChange={e => updateUrl(i, e.target.value)}
                            placeholder="http://192.168.1.50:8091"
                        />
                    </div>
                ))}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                    <div style={{ color: testStatus.includes("Failed") ? "#f44336" : (testStatus.includes("Connected") ? "#4caf50" : "#ddd") }}>
                        Status: <b>{testStatus}</b>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button style={{ ...styles.btnPrimary, background: "#4caf50" }} onClick={testConnection}>
                            Test & Connect
                        </button>
                        <button style={styles.btnPrimary} onClick={saveDispatchConfig}>
                            Save Config
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Settings() {
    const [cams, setCams] = useState([]);
    const [networkConfig, setNetworkConfig] = useState({
        mode: "dhcp", ip: "", netmask: "", gateway: "", dns1: "", dns2: ""
    });

    const [expanded, setExpanded] = useState({ "SETTINGS": true, "HARDWARE": true, "IP_DEVICES": true, "CHANNELS": true, "NETWORK": true, "USERS": true, "MAINTENANCE": true });
    const [selection, setSelection] = useState({ type: "SYSTEM", id: null, subTab: "SERVER" });

    const [scanning, setScanning] = useState(false);
    const [scanResults, setScanResults] = useState([]);
    const [statusData, setStatusData] = useState({});

    // ROI Drawing State
    const [isDrawing, setIsDrawing] = useState(false);
    const [roiPoints, setRoiPoints] = useState([]);

    // Modular AI
    const [availableModules, setAvailableModules] = useState([]);

    // Arming State
    const [armingSchedules, setArmingSchedules] = useState([]);
    const [armingAssignments, setArmingAssignments] = useState({});
    const [armingModes, setArmingModes] = useState({});
    const [armingLabels, setArmingLabels] = useState({});

    // Dynamic Models
    const { manufacturers: MANUFACTURERS, models: MODELS, capabilities: CAPABILITIES, loading: modelsLoading } = useModels();
    const [mfgFilter, setMfgFilter] = useState("");
    const [modelFilter, setModelFilter] = useState("");


    useEffect(() => {
        API.get("/ai/modules")
            .then(res => setAvailableModules(res.data))
            .catch(() => setAvailableModules([{ name: "yolo", classes: ["person", "car", "truck"] }]));
    }, []);

    // Manual Add Wizard State
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardData, setWizardData] = useState({ manufacturer: "", model: "" });

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentEditCam, setCurrentEditCam] = useState({});
    const [verificationStatus, setVerificationStatus] = useState(null);

    // Network Config State (Mock + Real)
    const [netConfig, setNetConfig] = useState({
        ipv4: "192.168.120.50",
        netmask: "255.255.255.0",
        gateway: "192.168.120.1",
        dns: "8.8.8.8",
        ipv6_enabled: false,
        ipv6: "fe80::1",
        vpn_enabled: false, vpn_ip: "", vpn_status: "Checking...", vpn_server: "vpn.smartguard.cloud",
        dispatchUrl: "", dispatchUrls: [], vpn_authKey: "", edgeName: "DSS-SMART GUARD"
    });

    // User Settings State (Mock)
    const [selectedUser, setSelectedUser] = useState(MOCK_USERS[1]);
    const [userForm, setUserForm] = useState({
        enableLocal: true, enableServer: false, enableMobile: false,
        group: "No group",
        rights: { view: true, viewArchive: true, hearSound: true, editBookmarks: true, usePtz: true, modify: true },
        ptzPriority: "8 (Normal Priority)",
        maxSpeed: "32x"
    });

    const [mockUsers, setMockUsers] = useState([]); // Real users
    const [newUserForm, setNewUserForm] = useState({ username: "", password: "", confirm: "", role: "operator" });
    const [currentUser, setCurrentUser] = useState({ role: "operator", name: "Guest", id: -1 });

    useEffect(() => {
        const stored = localStorage.getItem("edge_user");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setCurrentUser(parsed);
            } catch (e) { console.error("Failed to parse user", e); }
        }
    }, []);

    // Branding State (Synced with Network Config)
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    // Load users from API


    const loadUsers = async () => {
        try {
            const res = await API.get("/auth/users");
            // Map API user format to UI format
            const uiUsers = res.data.map(u => ({
                id: u.id || u.username,
                name: u.username,
                icon: u.role === 'admin' ? "👤" : "👮",
                role: u.role
            }));
            setMockUsers(uiUsers);
        } catch (e) {
            console.error("Failed to load users", e);
        }
    };

    const loadArming = async () => {
        try {
            const res = await API.get("/arming/data");
            setArmingSchedules(res.data.schedules || []);
            setArmingAssignments(res.data.assignments || {});
            setArmingModes(res.data.modes || {});
            setArmingLabels(res.data.labels || {});
        } catch (e) { console.error("Failed to load arming data", e); }
    };

    // Arming Handlers
    const handleSaveSchedules = async (newSchedules) => {
        try {
            await API.post("/arming/schedules", newSchedules);
            setArmingSchedules(newSchedules);
        } catch (e) { alert("Failed to save schedules: " + e.message); }
    };
    const handleSaveAssignments = async (newAssignments) => {
        try {
            await API.post("/arming/assignments", newAssignments);
            setArmingAssignments(newAssignments);
        } catch (e) { alert("Failed to save assignments: " + e.message); }
    };

    const handleSaveModes = async (newModes) => {
        try {
            await API.post("/arming/modes", newModes);
            setArmingModes(prev => ({ ...prev, ...newModes }));
            // FIX: Removed reload for seamless update
        } catch (e) { alert("Failed to save modes: " + e.message); }
    };

    const handleSaveLabels = async (newLabels) => {
        try {
            await API.post("/arming/labels", newLabels);
            setArmingLabels(prev => ({ ...prev, ...newLabels }));
            // FIX: Removed reload for seamless update
        } catch (e) { alert("Failed to save labels: " + e.message); }
    };

    useEffect(() => {
        loadArming();
        loadUsers();
        loadCams();
        loadNetwork();
        loadDispatchConfig();
        loadVpnStatus();
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleAddUser = async () => {
        if (!newUserForm.username || !newUserForm.password) return alert("Username and Password required");
        if (newUserForm.password !== newUserForm.confirm) return alert("Passwords do not match");

        try {
            await API.post("/auth/users", {
                username: newUserForm.username,
                password: newUserForm.password,
                role: newUserForm.role
            });
            alert("User created successfully");
            setNewUserForm({ username: "", password: "", confirm: "", role: "operator" });
            loadUsers();
            setSelection({ type: "SYSTEM" }); // Go back to system or keep on add?
        } catch (e) {
            alert("Error creating user: " + (e.response?.data?.error || e.message));
        }
    };

    const handleDeleteUser = async (username) => {
        if (!window.confirm(`Delete user ${username}?`)) return;
        try {
            await API.delete(`/auth/users/${username}`);
            loadUsers();
            setSelection({ type: "SYSTEM" });
        } catch (e) {
            alert("Error deleting user: " + (e.response?.data?.error || e.message));
        }
    };


    async function loadNetwork() {
        try {
            const res = await API.get("/network/config");
            setNetworkConfig(prev => ({ ...prev, ...(res.data || {}) }));
        } catch (e) { console.error("Net load err", e); }
    }

    async function saveNetwork() {
        try {
            await API.post("/network/config", networkConfig);
            alert("Network settings saved.");
            // Sync with local state if needed
            if (networkConfig.edgeName) {
                setNetConfig(prev => ({ ...prev, edgeName: networkConfig.edgeName }));
            }
        } catch (e) { alert("Error saving network: " + e.message); }
    }

    async function loadDispatchConfig() {
        try {
            const res = await API.get("/dispatch");
            const update = {};
            if (res.data.urls) update.dispatchUrls = res.data.urls;
            if (res.data.url) update.dispatchUrl = res.data.url;
            setNetConfig(prev => ({ ...prev, ...update }));
        } catch (e) { }
    }

    async function loadVpnStatus() {
        try {
            const res = await API.get("/vpn/status");
            setNetConfig(prev => ({
                ...prev,
                vpn_status: res.data.status,
                vpn_ip: res.data.ip
            }));
        } catch (e) { }
    }

    const saveDispatch = async () => {
        try { await API.post("/dispatch", { url: netConfig.dispatchUrl }); alert("Dispatch URL Saved."); } catch (e) { alert("Save failed: " + e.message); }
    };

    const connectVPN = async () => {
        try {
            if (!netConfig.vpn_authKey) { alert("Please enter an Auth Key"); return; }
            alert("Initiating VPN Connection... This may take a minute.");
            const res = await API.post("/vpn/setup", { authKey: netConfig.vpn_authKey });

            if (res.data.status === "success" && res.data.ip) {
                // Save the new VPN IP
                const updatedConfig = {
                    ...netConfig,
                    vpn_ip: res.data.ip,
                    vpn_status: "Connected"
                };

                setNetConfig(updatedConfig);

                // Persist to backend
                await API.post("/network/config", updatedConfig);
            }
            alert(res.data.message);
        } catch (e) { alert("VPN Setup Failed: " + (e.response?.data?.error || e.message)); }
    };

    async function loadCams() {
        try {
            const res = await API.get("/cameras/config");
            if (Array.isArray(res.data)) setCams(res.data);
        } catch (e) { console.error("Load failed", e); }
    }

    async function fetchStatus() {
        try {
            const [camRes, sysRes, evtRes] = await Promise.all([
                API.get("/cameras/status").catch(() => ({ data: {} })),
                API.get("/status").catch(() => ({ data: {} })),
                API.get("/events/recent").catch(() => ({ data: [] }))
            ]);

            setStatusData({
                ...(camRes.data || {}),
                system: sysRes.data || {},
                events: evtRes.data || []
            });
        } catch (e) { }
    }

    const saveAll = async (updatedCams) => {
        const toSave = updatedCams || cams;
        try {
            await API.post("/cameras/config", toSave);
            loadCams();
            // alert("Camera configuration saved Successfully."); // Removed for seamless auto-save
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const deleteCam = (id) => {
        if (window.confirm("Are you sure you want to delete this camera?")) {
            const newCams = cams.filter(c => c.id !== id);
            setCams(newCams);
            saveAll(newCams);
        }
    };


    const updateCam = (id, field, value) => {
        const newCams = cams.map(c => c.id === id ? { ...c, [field]: value } : c);
        setCams(newCams);
    };

    const startScan = async () => {
        setScanning(true);
        setScanResults([]);
        try {
            // Priority: User's actual subnet 120.x
            const res = await API.post("/discovery/scan", { range: "192.168.120.0/24" });
            setScanResults(res.data || []);
        } catch (e) {
            console.error("[UI] Scan failed:", e);
        }
        setScanning(false);
    };

    // Auto-scan on entering IP Devices
    useEffect(() => {
        if (selection.type === "IP_DEVICES_ROOT") {
            startScan();
        }
    }, [selection.type]);

    const addFromScan = (dev) => {
        // Go directly to Edit Modal if we know the manufacturer
        if (dev.manufacturer && dev.manufacturer !== "ONVIF Generic") {
            openEditModal({
                id: "cam_" + Date.now(),
                name: dev.name || dev.ip || `Camera ${dev.ip}`,
                ip: dev.ip,
                port: dev.port || (dev.manufacturer === 'Dahua' ? 37777 : 80),
                user: "admin",
                pass: "",
                manufacturer: dev.manufacturer,
                model: "Auto-detected",
                enabled: true
            });
        } else {
            // Fallback to Wizard if manufacturer is unknown
            setWizardData({
                manufacturer: "",
                model: "",
                scannedIp: dev.ip,
                scannedPort: dev.port || 80,
                scannedMfg: dev.manufacturer
            });
            setWizardStep(1);
        }
    };

    const startManualAdd = () => {
        setWizardData({ manufacturer: "", model: "" });
        setWizardStep(1);
    };

    const selectManufacturer = (mfg) => {
        setWizardData(prev => ({ ...prev, manufacturer: mfg }));
        setWizardStep(2);
        setModelFilter(""); // Reset model filter when entering model step
    };

    const selectModel = (model, caps = {}) => {
        setWizardData(prev => ({ ...prev, model }));

        // Auto-configure properties if caps provided
        if (caps.audio_channels > 0) handleModalChange("audio", true);
        else handleModalChange("audio", false);

        // TODO: Handle I/O mapping if UI supports it in future

        setWizardStep(3); // (Internal logic, actually we open modal now)

        // Use Scanned IP if available, else Default
        const finalIp = wizardData.scannedIp || "192.168.1.50";
        const finalPort = wizardData.scannedPort || 80;

        openEditModal({
            id: "cam_" + Date.now(),
            ip: finalIp,
            port: finalPort,
            user: "admin",
            pass: "admin123",
            manufacturer: wizardData.manufacturer,
            model: model,
            enabled: true
        });
        setWizardStep(0);
    };

    const openEditModal = (cam) => {
        setCurrentEditCam({ ...cam });
        setVerificationStatus(null);
        setIsEditModalOpen(true);
    };

    const closeEditModal = () => setIsEditModalOpen(false);

    // Deep Link Handling
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const editCamId = params.get("editCam");
        const editChannelId = params.get("editChannel");

        if (cams.length > 0) {
            const cam = cams.find(c => c.id === editCamId);
            if (cam) {
                setExpanded(prev => ({ ...prev, HARDWARE: true, IP_DEVICES: true }));
                setSelection({ type: "CAMERA", id: cam.id });
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
        if (editChannelId) {
            setExpanded(prev => ({ ...prev, CHANNELS: true }));
            setSelection({ type: "CHANNEL", id: editChannelId });
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [cams]);

    const handleModalChange = (field, value) => {
        setCurrentEditCam(prev => ({ ...prev, [field]: value }));
        setVerificationStatus(null);
    };

    const saveEditModal = async () => {
        setVerificationStatus("verifying");
        try {
            // Sanitize Inputs (Remove backslashes)
            const cleanCam = { ...currentEditCam };
            ['ip', 'user', 'pass'].forEach(k => {
                if (cleanCam[k]) cleanCam[k] = cleanCam[k].replace(/\\/g, "");
            });

            const verifyRes = await API.post("/cameras/probe", {
                ip: cleanCam.ip,
                port: cleanCam.port,
                user: cleanCam.user,
                pass: cleanCam.pass,
                manufacturer: cleanCam.manufacturer
            });

            const probeData = verifyRes.data;

            // Smart Probe Correction (Apply auto-detected port/manufacturer)
            if (probeData.port) cleanCam.port = probeData.port;
            if (probeData.manufacturer) cleanCam.manufacturer = probeData.manufacturer;

            // If probe returned channels, use them. Otherwise, fallback to templates.
            if (probeData.channels && probeData.channels.length > 0) {
                console.log(`[UI] Probe Success. Auto-filling ${probeData.channels.length} channels.`);

                // Assuming the camera has at least the main channel
                const firstChan = probeData.channels[0];
                cleanCam.rtsp = firstChan.streams.main || "";
                cleanCam.rtspHd = firstChan.streams.main || "";
                cleanCam.rtspSub = firstChan.streams.sub || "";

                // If the camera is multi-channel (like an NVR), we could expand this logic 
                // but for now we focus on the primary channel found.
            } else {
                console.log("[UI] Probe returned no channels. Falling back to template-based URL construction.");

                // Dynamic RTSP URL Construction based on Manufacturer & Model
                const modelConfig = findModelConfig(cleanCam.manufacturer, cleanCam.model || "");
                const legacyMfgData = DB_MANUFACTURERS.find(m => m.name === cleanCam.manufacturer) || {};

                let templateMain = modelConfig?.rtspMain || legacyMfgData.rtspTemplate || "rtsp://${user}:${pass}@${ip}:554/stream1";
                let templateSub = modelConfig?.rtspSub || legacyMfgData.rtspTemplateSub || templateMain;

                cleanCam.rtspHd = templateMain
                    .replace("${user}", cleanCam.user)
                    .replace("${pass}", cleanCam.pass)
                    .replace("${ip}", cleanCam.ip);

                cleanCam.rtsp = templateSub
                    .replace("${user}", cleanCam.user)
                    .replace("${pass}", cleanCam.pass)
                    .replace("${ip}", cleanCam.ip);
            }

            // Apply detected metadata
            if (probeData.model) cleanCam.model = probeData.model;
            if (probeData.channels) cleanCam.channels = probeData.channels.length;
            if (probeData.serial) cleanCam.serial = probeData.serial;

            const modelConfig = findModelConfig(cleanCam.manufacturer, cleanCam.model || "");
            const fetchedCaps = probeData.capabilities || { codec: "H.264", resolution: "1080p", fps: 25 };

            // Apply sanity checks for final URLs (Manual edits take precedence)
            const updatedCam = {
                ...cleanCam,
                name: cleanCam.name || `Camera ${cleanCam.ip}`,
                streams: { main: cleanCam.rtspHd, sub: cleanCam.rtsp },
                capabilities: fetchedCaps,
                recordingMode: currentEditCam.recordingMode || "continuous",
                motionSensitivity: currentEditCam.motionSensitivity || 50,
                commands: modelConfig?.commands || {}
            };

            const exists = cams.find(c => c.id === currentEditCam.id);
            let newCams;
            if (exists) { newCams = cams.map(c => c.id === currentEditCam.id ? updatedCam : c); }
            else { newCams = [...cams, updatedCam]; }

            await API.post("/cameras/config", newCams);
            loadCams();
            setVerificationStatus("success");
            setTimeout(() => { closeEditModal(); alert("Saved successfully!"); }, 500);

        } catch (e) {
            console.error("[UI] Save Error:", e);
            setVerificationStatus("error");
            alert("Connection Failed: " + (e.response?.data?.error || e.message));
        }
    };

    const getGroupedDevices = () => {
        const groups = {};
        const safeCams = Array.isArray(cams) ? cams : [];
        const safeScanResults = Array.isArray(scanResults) ? scanResults : [];

        const addedIps = new Set(safeCams.map(c => c.ip));
        const scannedIps = new Set(safeScanResults.map(r => r.ip));

        // 1. Process Scan Results (Display ALL detected devices)
        safeScanResults.forEach(r => {
            const isAdded = addedIps.has(r.ip);
            const mfg = r.manufacturer || "Unknown";
            if (!groups[mfg]) groups[mfg] = [];

            if (isAdded) {
                // It's detected AND already added
                const existing = safeCams.find(c => c.ip === r.ip);
                groups[mfg].push({ ...existing, type: 'added', _discovered: true });
            } else {
                // It's detected and NEW
                groups[mfg].push({ ...r, type: 'found', _discovered: true });
            }
        });

        // 2. Process Added Cameras that were NOT in Scan Results
        safeCams.forEach(c => {
            if (!scannedIps.has(c.ip)) {
                const mfg = c.manufacturer || "Unknown";
                if (!groups[mfg]) groups[mfg] = [];
                groups[mfg].push({ ...c, type: 'added', _discovered: false });
            }
        });

        return groups;
    };

    const toggleExpand = (section) => { setExpanded(prev => ({ ...prev, [section]: !prev[section] })); };

    const renderSidebar = () => (
        <div style={styles.sidebar}>
            <div style={{ padding: 10, borderBottom: "1px solid #444", fontWeight: "bold", cursor: "pointer" }} onDoubleClick={() => setIsEditingTitle(true)}>
                {isEditingTitle ? (
                    <input
                        autoFocus
                        value={networkConfig.edgeName || "DSS-SMART GUARD"} // Use networkConfig
                        onChange={(e) => setNetworkConfig({ ...networkConfig, edgeName: e.target.value })}
                        onBlur={() => { setIsEditingTitle(false); saveNetwork(); }} // Save on blur
                        onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditingTitle(false); saveNetwork(); } }}
                        style={{ width: "100%", background: "#333", color: "#fff", border: "1px solid #007acc", padding: "2px 5px", borderRadius: 2 }}
                    />
                ) : (
                    networkConfig.edgeName || "DSS-SMART GUARD"
                )}
            </div>

            {/* --- SETTINGS GROUP (Top Level) --- */}
            <div onClick={() => toggleExpand("SETTINGS")} style={{ padding: "8px 10px", cursor: "pointer", background: "#222", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5, borderTop: "1px solid #444", color: "#aaa" }}>
                <span style={{ transform: expanded["SETTINGS"] ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }}>▶</span> SETĂRI SISTEM
            </div>
            {
                expanded["SETTINGS"] && (
                    <div style={{ background: "#1a1a1a", borderBottom: "1px solid #333" }}>
                        <div onClick={() => setSelection({ type: "SYSTEM" })} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, background: selection.type === "SYSTEM" ? "#094771" : "transparent" }}>
                            Status Sistem
                        </div>

                        <div onClick={() => toggleExpand("USERS")} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, display: "flex", alignItems: "center" }}>
                            <span style={{ transform: expanded["USERS"] ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }}>▶</span> Utilizatori
                        </div>
                        {expanded["USERS"] && (
                            <div>
                                <div style={{ ...styles.subItem, paddingLeft: 45, color: "#4caf50", fontWeight: "bold", background: (selection.type === "ADD_USER") ? "#333" : "transparent" }} onClick={() => setSelection({ type: "ADD_USER" })}>+ Adaugă Utilizator</div>
                                {mockUsers.map(u => (
                                    <div key={u.id} style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "USER" && selection.id === u.id) ? "#333" : "transparent" }} onClick={() => { setSelection({ type: "USER", id: u.id }); setSelectedUser(u); }}>{u.name}</div>
                                ))}
                            </div>
                        )}

                        <div onClick={(e) => { e.stopPropagation(); setSelection({ ...selection, type: "ORPHANS" }); }} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, background: selection.type === "ORPHANS" ? "#094771" : "transparent", display: "flex", alignItems: "center" }}>
                            <span style={{ marginRight: 5 }}>🏚</span> Camere Șterse
                        </div>

                        <div onClick={() => toggleExpand("MAINTENANCE")} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, display: "flex", alignItems: "center" }}>
                            <span style={{ transform: expanded["MAINTENANCE"] ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }}>▶</span> Mentenanță
                        </div>
                        {expanded["MAINTENANCE"] && (
                            <div>
                                <div style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "MAINTENANCE_SERVICES") ? "#333" : "transparent" }} onClick={() => setSelection({ type: "MAINTENANCE_SERVICES" })}>Stare Servicii</div>
                                <div style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "MAINTENANCE_REBOOT") ? "#333" : "transparent" }} onClick={() => setSelection({ type: "MAINTENANCE_REBOOT" })}>Repornire</div>
                            </div>
                        )}

                        <div onClick={() => setSelection({ type: "SYSTEM_LOGS" })} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, background: selection.type === "SYSTEM_LOGS" ? "#094771" : "transparent" }}>
                            LOGS
                        </div>

                        <div onClick={() => toggleExpand("NETWORK")} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, display: "flex", alignItems: "center" }}>
                            <span style={{ transform: expanded["NETWORK"] ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }}>▶</span> Rețea
                        </div>
                        {expanded["NETWORK"] && (
                            <div>
                                <div style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "NETWORK_INTERFACE") ? "#333" : "transparent" }} onClick={() => setSelection({ type: "NETWORK_INTERFACE" })}>Interfață</div>
                                <div style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "NETWORK_VPN") ? "#333" : "transparent" }} onClick={() => setSelection({ type: "NETWORK_VPN" })}>VPN</div>
                                <div style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "NETWORK_SERVER") ? "#333" : "transparent" }} onClick={() => setSelection({ type: "NETWORK_SERVER" })}>Evenimente Server</div>
                                <div style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "NETWORK_PORTS") ? "#333" : "transparent" }} onClick={() => setSelection({ type: "NETWORK_PORTS" })}>Porturi Sistem</div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Hardware */}
            <div onClick={() => toggleExpand("HARDWARE")} style={{ padding: "8px 10px", cursor: "pointer", background: "#333", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5 }}>
                <span style={{ transform: expanded["HARDWARE"] ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }}>▶</span> Hardware
            </div>
            {
                expanded["HARDWARE"] && (
                    <>
                        <div onClick={(e) => { e.stopPropagation(); toggleExpand("IP_DEVICES"); setSelection({ ...selection, type: "IP_DEVICES_ROOT" }); }} style={{ padding: "5px 10px 5px 25px", cursor: "pointer", color: "#ddd", fontSize: 13, background: selection.type === "IP_DEVICES_ROOT" ? "#094771" : "transparent" }}>
                            <span style={{ display: "inline-block", transform: expanded["IP_DEVICES"] ? "rotate(90deg)" : "rotate(0deg)", marginRight: 5 }}>▶</span> Dispozitive IP
                        </div>
                        {expanded["IP_DEVICES"] && cams.map(c => (
                            <div key={"hw_" + c.id}
                                style={{ padding: "5px 10px 5px 45px", display: "flex", alignItems: "center", gap: 5, background: (selection.type === "CAMERA" && selection.id === c.id) ? "#094771" : "transparent", cursor: "pointer", fontSize: 12, color: "#ccc" }}
                                onClick={() => setSelection({ ...selection, type: "CAMERA", id: c.id })}
                            >
                                <span style={{ fontSize: 14 }}>📷</span> {c.name || c.ip}
                            </div>
                        ))}
                        {/* ARCHIVE MENU */}
                        <div onClick={(e) => { e.stopPropagation(); setSelection({ ...selection, type: "ARCHIVE" }); }} style={{ padding: "5px 10px 5px 25px", cursor: "pointer", color: "#ddd", fontSize: 13, background: selection.type === "ARCHIVE" ? "#094771" : "transparent", display: "flex", alignItems: "center" }}>
                            <span style={{ marginRight: 5 }}>💾</span> Arhivă
                        </div>
                    </>
                )
            }

            <div onClick={() => toggleExpand("CHANNELS")} style={{ padding: "8px 10px", cursor: "pointer", background: "#333", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5 }}>
                <span style={{ transform: expanded["CHANNELS"] ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }}>▶</span> Canale
            </div>
            {
                expanded["CHANNELS"] && cams.map(c => (
                    <div key={"ch_" + c.id}
                        style={{ padding: "5px 10px 5px 25px", display: "flex", alignItems: "center", gap: 5, background: (selection.type === "CHANNEL" && selection.id === c.id) ? "#094771" : "transparent", cursor: "pointer", fontSize: 12, color: "#ccc" }}
                        onClick={() => setSelection({ ...selection, type: "CHANNEL", id: c.id })}
                    >
                        <span>📹</span> {c.name || c.ip} - D1
                    </div>
                ))
            }

            {/* ARMING */}
            <div onClick={() => toggleExpand("ARMING")} style={{ padding: "8px 10px", cursor: "pointer", background: "#333", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5 }}>
                <span style={{ transform: expanded["ARMING"] ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }}>▶</span> Armare
            </div>
            {expanded["ARMING"] && (
                <div>
                    <div style={{ ...styles.subItem, paddingLeft: 25, background: selection.type === "ARMING_SCHEDULES" ? "#094771" : "transparent" }} onClick={() => setSelection({ type: "ARMING_SCHEDULES" })}>Definire Orar</div>
                    <div style={{ ...styles.subItem, paddingLeft: 25, background: selection.type === "ARMING_SETUP" ? "#094771" : "transparent" }} onClick={() => setSelection({ type: "ARMING_SETUP" })}>Setare Armare</div>
                </div>
            )}
        </div>
    );


    const renderContent = () => {
        // Arming Views
        if (selection.type === "ARMING_SCHEDULES") return <ScheduleEditor schedules={armingSchedules} onSave={handleSaveSchedules} />;
        if (selection.type === "ARMING_SETUP") return <ArmingMatrix schedules={armingSchedules} cams={cams} assignments={armingAssignments} modes={armingModes} labels={armingLabels} onSave={handleSaveAssignments} onSaveModes={handleSaveModes} onSaveLabels={handleSaveLabels} />;

        // SYSTEM VIEW
        if (selection.type === "SYSTEM") {
            return <Status />;
        }

        if (selection.type === "SYSTEM_LOGS") {
            return <SystemLogsView />;
        }

        // ADD USER VIEW
        if (selection.type === "ADD_USER") {
            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Add User</h2>
                    <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 500 }}>
                        <div style={{ marginBottom: 15 }}>
                            <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Login</label>
                            <input style={{ ...styles.input, width: "100%" }} value={newUserForm.username} onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 15 }}>
                            <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Password</label>
                            <input type="password" style={{ ...styles.input, width: "100%" }} value={newUserForm.password} onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 15 }}>
                            <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Confirm password</label>
                            <input type="password" style={{ ...styles.input, width: "100%" }} value={newUserForm.confirm} onChange={e => setNewUserForm({ ...newUserForm, confirm: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Group</label>
                            <select style={{ ...styles.input, width: "100%" }} value={newUserForm.role} onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}>
                                <option value="operator">Operator</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button style={styles.btnPrimary} onClick={handleAddUser}>Create User</button>
                        </div>
                    </div>
                </div>
            );
        }

        // USER MANAGEMENT VIEW
        if (selection.type === "USER") {
            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>User Settings - {selectedUser.name}</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                        {/* LEFT COL: Identity */}
                        <div>
                            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                                <div style={{ fontSize: 40, marginRight: 20 }}>{selectedUser.icon}</div>
                                <div style={{ flex: 1 }}>
                                    <label style={styles.label}>User name:</label>
                                    <input style={{ ...styles.input, width: "100%" }} value={selectedUser.name} readOnly disabled={true} />

                                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                                        <label style={{ display: "flex", alignItems: "center" }}><input type="checkbox" checked={selectedUser.role === 'admin' ? true : userForm.enableLocal} disabled={currentUser.role !== 'admin'} /> Enable local login</label>
                                        <label style={{ display: "flex", alignItems: "center" }}><input type="checkbox" checked={selectedUser.role === 'admin' ? true : userForm.enableServer} disabled={currentUser.role !== 'admin'} /> Enable login from Server/Client</label>
                                        <label style={{ display: "flex", alignItems: "center" }}><input type="checkbox" checked={selectedUser.role === 'admin' ? true : userForm.enableMobile} disabled={currentUser.role !== 'admin'} /> Enable login from mobile/web</label>
                                    </div>
                                    {/* Only admin can delete users */}
                                    {currentUser.role === 'admin' && selectedUser.role !== 'admin' && (
                                        <button style={{ ...styles.btnToolbar, marginTop: 10, color: "#f44336" }} onClick={() => handleDeleteUser(selectedUser.name)}>🗑 Delete user</button>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <label style={styles.label}>Group:</label>
                                <select
                                    style={styles.input}
                                    value={selectedUser.role === 'admin' ? 'admin' : 'operator'}
                                    disabled={currentUser.role !== 'admin' || selectedUser.id === currentUser.id} // Cannot change own group, operators cannot change groups
                                    // Logic to update role would go here if we had a handler for it
                                    onChange={(e) => alert("Changing group not fully implemented in mock!")}
                                >
                                    <option value="operator">Operator</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                        </div>

                        {/* RIGHT COL: Password */}
                        <div>
                            <div style={{ border: "1px solid #444", padding: 10, background: "#252526", marginBottom: 20 }}>
                                <h4 style={{ marginTop: 0, marginBottom: 10 }}>Password</h4>
                                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 10 }}>
                                    <label>New Password:</label>
                                    <input
                                        type="password"
                                        style={styles.input}
                                        disabled={currentUser.role !== 'admin' && currentUser.id !== selectedUser.id} // Admin can change anyone, User can change own
                                    />
                                    <label>Confirm:</label>
                                    <input
                                        type="password"
                                        style={styles.input}
                                        disabled={currentUser.role !== 'admin' && currentUser.id !== selectedUser.id}
                                    />
                                </div>
                                <button
                                    style={{ ...styles.btnToolbar, opacity: (currentUser.role !== 'admin' && currentUser.id !== selectedUser.id) ? 0.5 : 1 }}
                                    disabled={currentUser.role !== 'admin' && currentUser.id !== selectedUser.id}
                                >
                                    Change Password
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            );
        }



        // IP DEVICES
        if (selection.type === "IP_DEVICES_ROOT") {
            const grouped = getGroupedDevices();
            return (
                <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
                    <h2 style={{ fontSize: 18, marginBottom: 15, color: "#fff" }}>Dispozitive IP</h2>
                    <div style={{ marginBottom: 15, padding: 10, background: "#252526", borderBottom: "1px solid #444", display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button style={styles.btnPrimary} onClick={startScan}>{scanning ? "Se scanează..." : "Căutare Auto (ONVIF)"}</button>
                            <input placeholder="Filtrează rezultate..." style={{ background: "#333", border: "1px solid #444", padding: 6, color: "#fff", width: 200 }} />
                        </div>
                        <button style={styles.btnToolbar} onClick={startManualAdd}>+ Adaugă Manual</button>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", border: "1px solid #444", background: "#1e1e1e", padding: 10 }}>
                        {Object.keys(grouped).length === 0 && <div style={{ color: "#777", textAlign: "center", marginTop: 50 }}>No devices found. Click Auto Search to discover network devices.</div>}
                        {Object.keys(grouped).map(mfg => (
                            <div key={mfg} style={{ marginBottom: 20 }}>
                                <div style={{ background: "#333", padding: "5px 10px", fontWeight: "bold", fontSize: 13, color: "#fff", display: "flex", alignItems: "center" }}>
                                    {getLogo(mfg) ? <img src={getLogo(mfg)} alt={mfg} style={{ height: 20, marginRight: 10 }} /> : <span style={{ marginRight: 10 }}>🏭</span>}
                                    {mfg} ({grouped[mfg].length})
                                </div>
                                <table style={styles.table}>
                                    <thead><tr><th style={styles.th} width="50">Acțiune</th><th style={styles.th}>Stare</th><th style={styles.th}>Adresă IP</th><th style={styles.th}>Port</th><th style={styles.th}>Nume Dispozitiv</th><th style={styles.th}>Model</th></tr></thead>
                                    <tbody>
                                        {grouped[mfg].map((dev, idx) => (
                                            <tr key={idx}>
                                                <td style={styles.td}>
                                                    <div style={{ display: "flex", gap: 5 }}>
                                                        {dev.type === 'added' ? (
                                                            <>
                                                                <button style={{ fontSize: 10, background: "transparent", border: "1px solid #555", color: "#ddd", cursor: "pointer", padding: "2px 6px" }} onClick={() => openEditModal(dev)}>Edit</button>
                                                                <button style={{ fontSize: 10, background: "rgba(0,122,204,0.2)", border: "1px solid #007acc", color: "#81d4fa", cursor: "pointer", padding: "2px 6px", borderRadius: 2 }} onClick={() => setSelection({ type: "CHANNEL", id: dev.id })}>Channels</button>
                                                            </>
                                                        ) : (
                                                            <button style={{ fontSize: 10, background: "#4caf50", border: "none", color: "#fff", cursor: "pointer", borderRadius: 2, padding: "2px 6px" }} onClick={() => addFromScan(dev)}>+ Add</button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={styles.td}>{dev.type === 'added' ? (<span style={{ color: statusData[dev.id]?.connected ? "#4caf50" : "#f44336" }}>{statusData[dev.id]?.connected ? "Added" : "Offline"}</span>) : (<span style={{ color: "#2196f3" }}>Discovered</span>)}</td>
                                                <td style={styles.td}>{dev.ip}</td><td style={styles.td}>{dev.port}</td><td style={styles.td}>{dev.name || dev.ip}</td><td style={styles.td}>{dev.model || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (selection.type === "ORPHANS") {
            return <OrphansView />;
        }

        // ARCHIVE VIEW
        if (selection.type === "ARCHIVE") {
            const hdds = [
                { id: 1, device: "/dev/sda", size: "4 TB", status: "Healthy", usage: 45, type: "Local" },
                { id: 2, device: "/dev/sdb", size: "8 TB", status: "Healthy", usage: 12, type: "Local" }
            ];

            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Configurare Arhivă</h2>

                    {/* HDD Management */}
                    <div style={{ background: "#252526", padding: 20, border: "1px solid #444", marginBottom: 20 }}>
                        <h3 style={{ marginTop: 0, borderBottom: "1px solid #444", paddingBottom: 10 }}>Storage Devices</h3>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Device</th>
                                    <th style={styles.th}>Type</th>
                                    <th style={styles.th}>Size</th>
                                    <th style={styles.th}>Status</th>
                                    <th style={styles.th}>Usage</th>
                                    <th style={styles.th}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hdds.map((hdd, idx) => (
                                    <tr key={idx}>
                                        <td style={styles.td}>{hdd.device}</td>
                                        <td style={styles.td}>{hdd.type}</td>
                                        <td style={styles.td}>{hdd.size}</td>
                                        <td style={styles.td}><span style={{ color: "#4caf50", fontWeight: "bold" }}>{hdd.status}</span></td>
                                        <td style={styles.td}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <div style={{ width: 100, background: "#444", height: 8 }}>
                                                    <div style={{ width: `${hdd.usage}%`, background: "#007acc", height: "100%" }}></div>
                                                </div>
                                                {hdd.usage}%
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <button style={{ ...styles.btnToolbar, color: "#f44336" }} onClick={() => alert("Format feature coming soon")}>Format</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Statistics Section (Bottom) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        {/* Archive Statistics */}
                        <div style={{ background: "#252526", padding: 20, border: "1px solid #444" }}>
                            <h3 style={{ marginTop: 0, marginBottom: 15 }}>Archive statistics</h3>
                            <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#ddd" }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Main Stream:</span> <b>48.2 GB / 22.5 Days = 2.14 GB/Day</b></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Privileged:</span> <b>0.00 GB / 0.0 Days = 0.00 GB/Day</b></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Substream:</span> <b>12.5 GB / 30.0 Days = 0.41 GB/Day</b></div>
                            </div>
                        </div>

                        {/* Merge Statistics */}
                        <div style={{ background: "#252526", padding: 20, border: "1px solid #444" }}>
                            <h3 style={{ marginTop: 0, marginBottom: 15 }}>Merge statistics</h3>
                            <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#ddd" }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Main Stream:</span> <b>0.00 GB / 0.0 Days = -.-- GB/Day</b></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Substream:</span> <b>0.00 GB / 0.0 Days = -.-- GB/Day</b></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Hardware:</span> <b>0.00 GB / 0.0 Days = -.-- GB/Day</b></div>
                            </div>
                        </div>
                    </div>

                    {/* Camera Storage Mapping (Requested by user) */}
                    <div style={{ background: "#252526", padding: 20, border: "1px solid #444", marginTop: 20 }}>
                        <h3 style={{ marginTop: 0, borderBottom: "1px solid #444", paddingBottom: 10 }}>Active Camera Storage Mapping</h3>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Camera Name / IP</th>
                                    <th style={styles.th}>Storage ID</th>
                                    <th style={styles.th}>Physical HDD Path</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cams.filter(c => c.enabled).map((cam, idx) => (
                                    <tr key={idx}>
                                        <td style={styles.td}>{cam.name || cam.ip}</td>
                                        <td style={styles.td}><code style={{ color: "#aaa" }}>{cam.storagePath || "N/A"}</code></td>
                                        <td style={styles.td}>
                                            <input
                                                type="text"
                                                readOnly
                                                value={cam.physicalPath || "Generating..."}
                                                style={{
                                                    width: "100%",
                                                    background: "#111",
                                                    border: "1px solid #333",
                                                    color: "#007acc",
                                                    fontSize: 11,
                                                    padding: "4px 8px",
                                                    fontFamily: "monospace",
                                                    borderRadius: 3
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {cams.filter(c => c.enabled).length === 0 && (
                                    <tr>
                                        <td colSpan="3" style={{ ...styles.td, textAlign: "center", color: "#666", padding: 20 }}>
                                            No active cameras configured for recording.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }







        if (selection.type === "NETWORK_INTERFACE") {
            const isManual = networkConfig.mode === "manual";
            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Interface Settings (IPv4/IPv6)</h2>
                    <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 700 }}>
                        <div style={{ marginBottom: 15, borderBottom: "1px solid #444", paddingBottom: 10, fontWeight: "bold", color: "#ddd", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Detected Configuration</span>
                            <span style={{ fontSize: 12, color: '#aaa', background: '#333', padding: '2px 6px', borderRadius: 4 }}>{networkConfig.interface || "Detecting..."}</span>
                        </div>

                        <div style={{ marginBottom: 20, display: "flex", gap: 20 }}>
                            <label style={{ display: "flex", alignItems: "center", cursor: "pointer", color: !isManual ? "#fff" : "#aaa" }}>
                                <input type="radio" name="netmode" checked={!isManual} onChange={() => setNetworkConfig({ ...networkConfig, mode: "dhcp" })} style={{ marginRight: 8 }} />
                                DHCP (Automatic)
                            </label>
                            <label style={{ display: "flex", alignItems: "center", cursor: "pointer", color: isManual ? "#fff" : "#aaa" }}>
                                <input type="radio" name="netmode" checked={isManual} onChange={() => setNetworkConfig({ ...networkConfig, mode: "manual" })} style={{ marginRight: 8 }} />
                                Manual Configuration
                            </label>
                        </div>

                        <div style={{ opacity: isManual ? 1 : 0.5, pointerEvents: isManual ? "auto" : "none", transition: "0.2s" }}>
                            <div style={styles.formGrid}><label style={styles.label}>IPv4 Address:</label><input style={styles.input} value={networkConfig.ip} onChange={e => setNetworkConfig({ ...networkConfig, ip: e.target.value })} placeholder="192.168.1.50" /></div>
                            <div style={styles.formGrid}><label style={styles.label}>Netmask:</label><input style={styles.input} value={networkConfig.netmask} onChange={e => setNetworkConfig({ ...networkConfig, netmask: e.target.value })} placeholder="255.255.255.0" /></div>
                            <div style={styles.formGrid}><label style={styles.label}>Gateway:</label><input style={styles.input} value={networkConfig.gateway} onChange={e => setNetworkConfig({ ...networkConfig, gateway: e.target.value })} placeholder="192.168.1.1" /></div>
                            <div style={styles.formGrid}><label style={styles.label}>DNS Server 1:</label><input style={styles.input} value={networkConfig.dns1} onChange={e => setNetworkConfig({ ...networkConfig, dns1: e.target.value })} placeholder="8.8.8.8" /></div>
                            <div style={styles.formGrid}><label style={styles.label}>DNS Server 2:</label><input style={styles.input} value={networkConfig.dns2} onChange={e => setNetworkConfig({ ...networkConfig, dns2: e.target.value })} placeholder="8.8.4.4" /></div>
                        </div>
                        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}><button style={styles.btnPrimary} onClick={saveNetwork}>Save Network Settings</button></div>
                    </div>
                </div>
            );
        }

        if (selection.type === "NETWORK_VPN") {
            const isConnected = netConfig.vpn_status === "Connected";
            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>VPN Configuration (Tailscale)</h2>
                    <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 500 }}>
                        <div style={{ marginBottom: 20 }}>
                            Status:
                            <span style={{ color: isConnected ? "#4caf50" : "#f44336", fontWeight: "bold", marginLeft: 10 }}>
                                {isConnected ? "Running" : "Stopped"}
                            </span>
                        </div>

                        {isConnected && (
                            <div style={{ marginBottom: 15, background: "#333", padding: 10, borderRadius: 4 }}>
                                <div style={{ fontSize: 13, color: "#aaa" }}>Assigned VPN IP:</div>
                                <div style={{ fontSize: 16, color: "#fff", fontWeight: "bold" }}>{netConfig.vpn_ip || "Unknown"}</div>
                            </div>
                        )}

                        {!isConnected && (
                            <div style={{ marginBottom: 15 }}>
                                <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Auth Key</label>
                                <input style={{ ...styles.input, width: "100%" }} value={netConfig.vpn_authKey} onChange={e => setNetConfig({ ...netConfig, vpn_authKey: e.target.value })} placeholder="tskey-auth-..." />
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 10 }}>
                            {!isConnected && <button style={styles.btnPrimary} onClick={connectVPN}>Connect VPN</button>}
                            {isConnected && (
                                <button
                                    style={{ ...styles.btnPrimary, background: "#f44336" }}
                                    onClick={async () => {
                                        if (!window.confirm("Are you sure you want to disconnect VPN? Remote access will be lost.")) return;
                                        try {
                                            await API.post("/vpn/disconnect");
                                            setNetConfig(prev => ({ ...prev, vpn_status: "Disconnected", vpn_ip: "" }));
                                            await API.post("/network/config", { ...netConfig, vpn_status: "Disconnected", vpn_ip: "" }); // Save state
                                            alert("VPN Disconnected.");
                                        } catch (e) { alert("Error: " + e.message); }
                                    }}
                                >
                                    Disconnect VPN
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        if (selection.type === "NETWORK_SERVER") {
            return <DispatchFailoverSettings netConfig={netConfig} setNetConfig={setNetConfig} />;
        }

        if (selection.type === "NETWORK_PORTS") {
            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>System Port Usage</h2>
                    <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 800 }}>
                        <table style={styles.table}>
                            <thead><tr><th style={styles.th}>Serviciu</th><th style={styles.th}>Port</th><th style={styles.th}>Protocol</th><th style={styles.th}>Direcție</th><th style={styles.th}>Descriere</th></tr></thead>
                            <tbody>
                                <tr><td style={styles.td}>Interfață Web</td><td style={styles.td}><input style={{ ...styles.inputTable, width: 60 }} defaultValue="80" /></td><td style={styles.td}>TCP</td><td style={styles.td}>Inbound</td><td style={styles.td}>Acces la acest panou de control</td></tr>
                                <tr><td style={styles.td}>API Local</td><td style={styles.td}><input style={{ ...styles.inputTable, width: 60 }} defaultValue="3000" /></td><td style={styles.td}>TCP</td><td style={styles.td}>Local</td><td style={styles.td}>API Backend Intern</td></tr>
                                <tr><td style={styles.td}>SSH</td><td style={styles.td}><input style={{ ...styles.inputTable, width: 60 }} defaultValue="22" /></td><td style={styles.td}>TCP</td><td style={styles.td}>Inbound</td><td style={styles.td}>Administrare Sistem</td></tr>
                                <tr><td style={styles.td}>VPN (Tailscale)</td><td style={styles.td}><input style={{ ...styles.inputTable, width: 60 }} defaultValue="41641" /></td><td style={styles.td}>UDP</td><td style={styles.td}>Bidirectional</td><td style={styles.td}>Tunel Securizat</td></tr>
                                <tr><td style={styles.td}>NVR/Cameră</td><td style={styles.td}><input style={{ ...styles.inputTable, width: 60 }} defaultValue="554" /></td><td style={styles.td}>TCP/UDP</td><td style={styles.td}>Outbound</td><td style={styles.td}>Preluare fluxuri video</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        if (selection.type === "MAINTENANCE_SERVICES") {
            const handleRestartService = async () => {
                if (!window.confirm("Sunteți sigur că doriți să reporniți serviciile DSS? Interfața se va deconecta temporar.")) return;
                try {
                    await API.post("/status/restart-service");
                    alert("Comanda de restart trimisă. Pagina se va reîncărca automat în 10 secunde.");
                    setTimeout(() => window.location.reload(), 10000);
                } catch (e) { alert("Eroare: " + e.message); }
            };

            const services = [
                { name: "dss-edge", label: "Core Business Logic", status: "Running", details: "Orchestration, Auth, API Layer, Event Bus", icon: "🧠" },
                { name: "go2rtc", label: "Media Server (Video)", status: "Running", details: "RTSP Proxy, WebRTC, HLS, MSE", icon: "🎥" },
                { name: "recorder", label: "Recording Engine", status: (statusData?.storageMap || statusData?.storageMap === true) ? "Active" : "Idle", details: "Continuous Segmenter, Cleanup", icon: "💾" },
                { name: "ai-engine", label: "Computer Vision", status: "Enabled", details: "YOLOv8 Detection, LPR Analysis", icon: "👁️" }
            ];

            return (
                <div style={{ padding: 30, background: "#121212", minHeight: "100%", color: "#e0e0e0" }}>
                    <div style={{ marginBottom: 30, borderBottom: "1px solid #333", paddingBottom: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <h2 style={{ fontSize: 22, margin: 0, color: "#fff", letterSpacing: 0.5 }}>Service Maintenance</h2>
                            <div style={{ fontSize: 13, color: "#666", marginTop: 5 }}>Manage core system processes and diagnostics</div>
                        </div>
                        <button
                            onClick={handleRestartService}
                            style={{
                                background: "#ff9800", color: "#111", border: "none",
                                padding: "8px 20px", borderRadius: 4, cursor: "pointer",
                                fontWeight: "bold", fontSize: 13, display: "flex", alignItems: "center", gap: 8
                            }}
                        >
                            🔄 RESTART STACK
                        </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                        {/* LEFT COL: SERVICE HEALTH */}
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 15, letterSpacing: 1, textTransform: "uppercase" }}>Critical Services</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                                {services.map(s => (
                                    <div key={s.name} style={{ background: "#1e1e1e", padding: 20, borderRadius: 8, borderLeft: `4px solid ${s.status === "Running" || s.status === "Active" || s.status === "Enabled" ? "#4caf50" : "#f44336"}`, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                                            <div style={{ fontSize: 24, width: 40, textAlign: "center" }}>{s.icon || "🔧"}</div>
                                            <div>
                                                <div style={{ fontSize: 15, fontWeight: "bold", color: "#ddd" }}>{s.label}</div>
                                                <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>{s.details}</div>
                                            </div>
                                        </div>
                                        <div style={{
                                            background: s.status === "Running" || s.status === "Active" || s.status === "Enabled" ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)",
                                            color: s.status === "Running" || s.status === "Active" || s.status === "Enabled" ? "#4caf50" : "#f44336",
                                            padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: "bold", textTransform: "uppercase"
                                        }}>
                                            {s.status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RIGHT COL: DIAGNOSTICS & LOGS */}
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 15, letterSpacing: 1, textTransform: "uppercase" }}>Streaming Diagnostics</div>
                            <div style={{ display: "grid", gap: 15 }}>
                                <div onClick={() => window.open(`http://${window.location.hostname}:1984/`, '_blank')} style={{ background: "#1e1e1e", padding: 20, borderRadius: 8, border: "1px solid #333", cursor: "pointer", display: "flex", alignItems: "center", gap: 15, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "#2196f3"} onMouseLeave={e => e.currentTarget.style.borderColor = "#333"}>
                                    <div style={{ background: "#2196f3", width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff" }}>📊</div>
                                    <div>
                                        <div style={{ fontWeight: "bold", color: "#eee" }}>Go2RTC Dashboard</div>
                                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Visual stream inspector, codec info, and bandwidth stats</div>
                                    </div>
                                </div>
                                <div onClick={() => window.open(`http://${window.location.hostname}:1984/log.html`, '_blank')} style={{ background: "#1e1e1e", padding: 20, borderRadius: 8, border: "1px solid #333", cursor: "pointer", display: "flex", alignItems: "center", gap: 15, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "#ff9800"} onMouseLeave={e => e.currentTarget.style.borderColor = "#333"}>
                                    <div style={{ background: "#ff9800", width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff" }}>⚠️</div>
                                    <div>
                                        <div style={{ fontWeight: "bold", color: "#eee" }}>Live Error Log</div>
                                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Real-time WebRTC/RTSP connection errors</div>
                                    </div>
                                </div>
                                <div onClick={() => window.open(`http://${window.location.hostname}:1984/api/streams`, '_blank')} style={{ background: "#1e1e1e", padding: 20, borderRadius: 8, border: "1px solid #333", cursor: "pointer", display: "flex", alignItems: "center", gap: 15, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "#9c27b0"} onMouseLeave={e => e.currentTarget.style.borderColor = "#333"}>
                                    <div style={{ background: "#9c27b0", width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff" }}>🔍</div>
                                    <div>
                                        <div style={{ fontWeight: "bold", color: "#eee" }}>Raw Stream API</div>
                                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>JSON output of all active stream configurations</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 15, marginTop: 30, letterSpacing: 1, textTransform: "uppercase" }}>System Operations</div>
                            <div style={{ padding: 20, background: "rgba(255, 152, 0, 0.05)", border: "1px solid rgba(255, 152, 0, 0.2)", borderRadius: 8 }}>
                                <h4 style={{ margin: "0 0 10px 0", color: "#ff9800", fontSize: 14 }}>Restart Policy</h4>
                                <p style={{ margin: 0, fontSize: 13, color: "#aaa", lineHeight: "1.5" }}>
                                    System services are managed by <code>systemd</code>. Restarting the stack will momentarily drop active connections (Live & Recording).
                                    The "Watchdog" service will automatically ensure all modules come back online within 15 seconds.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (selection.type === "MAINTENANCE_REBOOT") {
            const handleReboot = async () => {
                if (!window.confirm("ATENȚIUNE! Sunteți sigur că doriți să reporniți serverul? Toată monitorizarea va fi oprită până la repornire.")) return;
                try {
                    await API.post("/status/reboot");
                    alert("Comanda de reboot executată. Serverul se va opri imediat.");
                } catch (e) { alert("Eroare: " + e.message); }
            };

            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>🛠 Mentenanță - Server</h2>
                    <div style={{ background: "#252526", padding: 25, border: "1px solid #444", borderRadius: 4, maxWidth: 600 }}>
                        <h3 style={{ marginTop: 0, color: "#f44336" }}>Reboot Server (Sistem de operare)</h3>
                        <p style={{ color: "#aaa", fontSize: 14, lineHeight: "1.6" }}>
                            Această acțiune va reporni complet sistemul hardware/VDS. Se recomandă doar în cazul unor probleme majore de conectivitate sau la solicitarea suportului tehnic.
                        </p>
                        <div style={{ background: "rgba(244, 67, 54, 0.1)", border: "1px solid #f44336", padding: 10, borderRadius: 4, marginBottom: 20 }}>
                            <p style={{ color: "#f44336", margin: 0, fontSize: 13 }}>
                                <b>Atenție:</b> Toate serviciile (incluzând VPN, SSH și Monitorizarea) vor fi indisponibile timp de 1-2 minute.
                            </p>
                        </div>
                        <button
                            style={{ ...styles.btnPrimary, background: "#f44336", padding: "12px 30px", fontSize: 15 }}
                            onClick={handleReboot}
                        >
                            ⚡ Reboot Complet Server
                        </button>
                    </div>
                </div>
            );
        }

        const cam = cams.find(c => c.id === selection.id);
        if (!cam) return <div>Item not found</div>;

        // CHANNEL VIEW (AI Config)
        if (selection.type === "CHANNEL") {
            // Determine points to show: active drawing points OR saved points
            const pointsToShow = isDrawing ? roiPoints : (cam.ai_server?.roi || []);
            const shouldShowCanvas = isDrawing || (pointsToShow && pointsToShow.length > 0);

            return (
                <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 15 }}>
                        <h2 style={{ fontSize: 18, margin: 0, color: "#fff" }}>AI Configuration - {cam.name || cam.ip}</h2>
                        <a href="#" onClick={(e) => { e.preventDefault(); setSelection({ type: "CAMERA", id: cam.id }); }} style={{ color: "rgb(66, 165, 245)", textDecoration: "none", fontSize: 13 }}>← Back to Hardware Settings</a>
                    </div>
                    <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
                        <div style={{ position: "relative", width: 320, height: 220, border: "none" }}>
                            {/* Use CameraCard to show icons. Pass a mock 'onUpdate' or minimal one if buttons are clicked. 
                                We set isMaximized={false} to see icons. This adds padding/header. 
                                Adjust container headers/height accordingly. 
                            */}
                            <CameraCard cam={cam} isMaximized={false} />

                            {/* ROI Canvas Overlay - Must sit on top of the video part of CameraCard. 
                                CameraCard content is flex column. Video is flex:1. 
                                It's tricky to overlay exactly on the video 'div' inside CameraCard without modifying CameraCard to accept children overlay.
                                However, CameraCard uses WSPlayer inside.
                                
                                User wants icons. Icons are in CameraCard.
                                CanvasROI is for drawing lines.
                                
                                If I just overlay CanvasROI over the WHOLE card, the buttons might be covered or Canvas might be misaligned with video if card has header.
                                
                                Workaround: Position CanvasROI manually to match the video area approx? 
                                Video area in CameraCard (unmaximized) is below header (approx 20px) and inside 10px padding.
                                
                                BETTER APPROACH for "Channels":
                                The user specifically wants the icons. 
                                I will just render CameraCard.
                                I will simply enable the specific overlay for drawing if 'shouldShowCanvas' is true, 
                                but I'll make CanvasROI position absolute with offsets to match CameraCard's inner video area.
                                
                                Inner Video Area estimate:
                                Top: ~30px (Header + padding top)
                                Left: 10px
                                Width: 100% - 20px
                                Height: 100% - 40px (Header + margins)
                                
                                Actually, sticking CanvasROI on top of CameraCard might block the buttons.
                                Let's just put CameraCard for now as requested. 
                                If they need to draw ROI, honestly the 'image' they draw on should match where the video is.
                                
                                Let's try to fit CameraCard in the container.
                            */}
                            {shouldShowCanvas && (
                                <div style={{ position: "absolute", top: 35, left: 10, right: 10, bottom: 10, pointerEvents: isDrawing ? "auto" : "none", zIndex: 5 }}>
                                    <CanvasROI points={pointsToShow} onChange={isDrawing ? setRoiPoints : undefined} width={300} height={175} readOnly={!isDrawing} />
                                </div>
                            )}
                        </div>

                        {/* Recording Configuration (Right of Image) */}
                        <div style={{ flex: 1, padding: 10, background: "#1e1e1e", border: "1px solid #444", display: "flex", flexDirection: "column", gap: 10 }}>
                            <h4 style={{ margin: 0, color: "#ddd", borderBottom: "1px solid #444", paddingBottom: 5 }}>Recording Setup</h4>
                            <label style={{ fontSize: 13, color: "#aaa" }}>
                                Mode:
                                <select
                                    style={{ marginLeft: 5, background: "#333", border: "1px solid #555", color: "#fff", padding: 3, width: "100%" }}
                                    value={cam.recordingMode || "continuous"}
                                    onChange={e => {
                                        updateCam(cam.id, "recordingMode", e.target.value);
                                        saveAll(cams.map(c => c.id === cam.id ? { ...c, recordingMode: e.target.value } : c));
                                    }}
                                >
                                    <option value="continuous">Continuous (24/7)</option>
                                    <option value="motion">Motion Only</option>
                                    <option value="off">Fără înregistrare</option>
                                </select>
                            </label>
                            {cam.storagePath && (
                                <div style={{ fontSize: 11, color: "#888", marginTop: -5, paddingLeft: 5 }}>
                                    Virtual ID: <span style={{ fontFamily: "monospace" }}>{cam.storagePath}</span>
                                </div>
                            )}
                            {cam.physicalPath && (
                                <div style={{ marginTop: 5, padding: "0 5px" }}>
                                    <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 2 }}>HDD Storage Path:</label>
                                    <input
                                        type="text"
                                        readOnly
                                        value={cam.physicalPath}
                                        style={{
                                            width: "100%",
                                            background: "#111",
                                            border: "1px solid #333",
                                            color: "#007acc",
                                            fontSize: 10,
                                            padding: "3px 5px",
                                            fontFamily: "monospace",
                                            borderRadius: 3
                                        }}
                                    />
                                </div>
                            )}
                            {cam.recordingMode === "motion" && (
                                <label style={{ fontSize: 13, color: "#aaa" }}>
                                    Motion Sens ({cam.motionSensitivity || 50}%):
                                    <input
                                        type="range" min="1" max="100"
                                        style={{ width: "100%", marginTop: 5 }}
                                        value={cam.motionSensitivity || 50}
                                        onChange={e => updateCam(cam.id, "motionSensitivity", parseInt(e.target.value))}
                                        onMouseUp={() => saveAll(cams)}
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                    {isDrawing && (<div style={{ marginBottom: 15 }}><button style={{ ...styles.btnPrimary, background: "#4caf50" }} onClick={() => { setIsDrawing(false); const newConf = { ...(cam.ai_server || {}), roi: roiPoints }; updateCam(cam.id, "ai_server", newConf); saveAll(cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c)); }}>Save Area</button><button style={styles.btnToolbar} onClick={() => { setIsDrawing(false); setRoiPoints([]); }}>Cancel</button></div>)}
                    <div style={{ background: "#252526", padding: 20, border: "1px solid #444" }}>

                        {/* 1. Detector Selection Row */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: "block", color: "#ddd", marginBottom: 5, fontSize: 13 }}>Motion Detector / AI Model:</label>
                            <div style={{ display: "flex", gap: 10 }}>
                                <select
                                    style={{ ...styles.input, flex: 1, padding: 8, fontSize: 14 }}
                                    value={cam.ai_server?.module || "ai_small"}
                                    onChange={e => {
                                        const newConf = { ...(cam.ai_server || {}), module: e.target.value, enabled: true };
                                        updateCam(cam.id, "ai_server", newConf);
                                        saveAll(cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c));
                                    }}
                                >
                                    {availableModules.map(mod => {
                                        let label = mod.name.toUpperCase();
                                        if (mod.name === "ai_small") label = "AI Small";
                                        if (mod.name === "ai_medium") label = "AI Medium";
                                        if (mod.name === "ai_premium") label = "AI Premium";
                                        return <option key={mod.name} value={mod.name}>{label} (YOLO)</option>;
                                    })}
                                    <option value="camera_native">CAMERA DETECTOR (On-Device)</option>
                                    {availableModules.length === 0 && <option value="ai_small">Loading modules...</option>}
                                </select>

                                {/* Only show Setup Zones if Server AI is used */}
                                {cam.ai_server?.module !== "camera_native" && (
                                    <div style={{ display: "flex", gap: 10 }}>
                                        <button
                                            style={{ ...styles.btnToolbar, background: "#ddd", color: "#333", fontWeight: "bold" }}
                                            onClick={() => { setRoiPoints(cam.ai_server?.roi || []); setIsDrawing(true); }}
                                        >
                                            Setup Zones...
                                        </button>
                                        {(cam.ai_server?.roi && cam.ai_server.roi.length > 0) && (
                                            <button
                                                style={{ ...styles.btnToolbar, background: "#f44336", color: "#fff", fontWeight: "bold" }}
                                                onClick={() => {
                                                    // FIX: Remove confirmation for seamless action
                                                    const newConf = { ...(cam.ai_server || {}), roi: [] };
                                                    updateCam(cam.id, "ai_server", newConf);
                                                    saveAll(cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c));
                                                }}
                                            >
                                                Delete Zone
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sensitivity Slider */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: "block", color: "#ddd", marginBottom: 5, fontSize: 13 }}>Sensitivity: {cam.ai_server?.sensitivity || 50}%</label>
                            <input
                                type="range"
                                min="10"
                                max="100"
                                value={cam.ai_server?.sensitivity || 50}
                                onChange={e => {
                                    const newConf = { ...(cam.ai_server || {}), sensitivity: parseInt(e.target.value) };
                                    updateCam(cam.id, "ai_server", newConf);
                                }}
                                onMouseUp={() => saveAll()} // Save on release
                                style={{ width: "100%", accentColor: "#2196f3" }}
                            />
                        </div>

                        {/* 2. Dynamic Content */}
                        {cam.ai_server?.module === "camera_native" ? (
                            // ON-DEVICE SETTINGS
                            <div style={{ padding: 10, background: "#1e1e1e", border: "1px solid #444" }}>
                                <div style={{ marginBottom: 10, color: "#ffa726", fontSize: 13 }}>⚠ Handled by Camera Hardware. Settings below configure the camera directly.</div>
                                <div style={{ marginBottom: 10 }}><label><input type="checkbox" checked={cam.ai_motion || false} onChange={e => updateCam(cam.id, "ai_motion", e.target.checked)} /> Motion Detection</label></div>
                                <div style={{ marginBottom: 10 }}><label><input type="checkbox" checked={cam.ai_line || false} onChange={e => updateCam(cam.id, "ai_line", e.target.checked)} /> Line Crossing</label></div>
                                <div style={{ marginBottom: 10 }}><label><input type="checkbox" checked={cam.ai_intrusion || false} onChange={e => updateCam(cam.id, "ai_intrusion", e.target.checked)} /> Intrusion Detection</label></div>
                            </div>
                        ) : (
                            // SERVER AI OBJECT LIST
                            <div style={{ marginBottom: 20, padding: 15, border: "1px solid #444", background: "#1e1e1e" }}>
                                <label style={{ display: "block", color: "#aaa", marginBottom: 10, fontSize: 12, textTransform: "uppercase" }}>Object Filters (Select active)</label>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                                    {(() => {
                                        const currentModName = cam.ai_server?.module || "ai_small";
                                        const currentMod = availableModules.find(m => m.name === currentModName);
                                        const classes = currentMod ? currentMod.classes : [];

                                        if (classes.length === 0) return <div style={{ color: "#777", fontSize: 13 }}>No specific objects for this model.</div>;

                                        return classes.map(obj => (
                                            <label key={obj} style={{ display: "flex", alignItems: "center", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={cam.ai_server?.objects?.[obj] || false}
                                                    onChange={e => {
                                                        const newObjs = { ...(cam.ai_server?.objects || {}), [obj]: e.target.checked };
                                                        const newConf = { ...(cam.ai_server || {}), objects: newObjs };
                                                        updateCam(cam.id, "ai_server", newConf);
                                                        saveAll(cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c));
                                                    }}
                                                    style={{ marginRight: 8 }}
                                                />
                                                {obj.charAt(0).toUpperCase() + obj.slice(1)}
                                            </label>
                                        ));
                                    })()}
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: 20, fontSize: 12, color: "#888", display: "flex", gap: 10, alignItems: "center" }}>
                            <input type="checkbox" checked={cam.ai_server?.enabled || false} onChange={e => { const newConf = { ...(cam.ai_server || {}), enabled: e.target.checked }; updateCam(cam.id, "ai_server", newConf); saveAll(cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c)); }} />
                            <span>Master Enable (Processing active)</span>
                        </div>

                    </div>
                </div>
            );
        }



        // CAMERA HARDWARE VIEW
        return (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 15, color: "#fff" }}>Camera {cam.ip}</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10, maxWidth: 600, marginBottom: 15 }}><label>Model:</label> <div style={{ fontWeight: "bold" }}>{cam.model || "Autodetect"}</div><label>Device Name:</label> <input style={{ background: "#333", border: "1px solid #555", color: "#ddd", padding: 4 }} value={cam.name || `Camera ${cam.ip}`} onChange={e => updateCam(cam.id, "name", e.target.value)} onBlur={() => saveAll(cams)} /></div>
                    <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 15 }}><span>IP Address: <b style={{ color: "#fff" }}>{cam.ip}</b></span><span>Port: <b style={{ color: "#fff" }}>{cam.port}</b></span><span>User: <b style={{ color: "#fff" }}>{cam.user}</b></span><a href="#" onClick={(e) => { e.preventDefault(); openEditModal(cam); }} style={{ color: "rgb(66, 165, 245)", textDecoration: "none" }}>Setup connection</a></div>
                    {cam.storagePath && <div style={{ marginBottom: 20, fontSize: 13, color: "#ccc" }}>Storage Path: <span style={{ fontFamily: "monospace", color: "#81d4fa" }}>{cam.storagePath}</span></div>}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, auto)", gap: 10, marginBottom: 20, alignItems: "center", justifyContent: "start" }}>
                        <button style={{ ...styles.btnToolbar, width: 120, background: (cam.enabled !== false) ? "#333" : "#4caf50", color: (cam.enabled !== false) ? "#ddd" : "#fff" }} onClick={() => { const next = (cam.enabled !== false) ? false : true; updateCam(cam.id, "enabled", !!next); saveAll(cams.map(c => c.id === cam.id ? { ...c, enabled: !!next } : c)); }}>{(cam.enabled !== false) ? "Disable" : "Enable"}</button>
                        <button style={{ ...styles.btnToolbar, width: 120 }} onClick={() => deleteCam(cam.id)}>🗑 Delete...</button>
                        <button
                            style={{ ...styles.btnToolbar, background: "rgba(0,122,204,0.1)", border: "1px solid #007acc", color: "#81d4fa", width: 160 }}
                            onClick={() => setSelection({ type: "CHANNEL", id: cam.id })}
                        >
                            ⚙ AI / Channel Setup →
                        </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, auto)", gap: 10, marginBottom: 20, justifyContent: "start" }}>
                        <a href={`http://${cam.ip}`} target="_blank" rel="noreferrer" style={{ color: "rgb(66, 165, 245)", textDecoration: "none", alignSelf: "center", margin: "0 10px" }}>Web Interface</a>
                    </div>
                    <div style={{ marginBottom: 30 }}>{statusData[cam.id]?.connected ? <div>State: <span style={{ color: "rgb(76, 175, 80)", fontWeight: "bold" }}>Connected</span></div> : <div>State: <span style={{ color: "#f44336", fontWeight: "bold" }}>Disconnected</span> <span style={{ fontSize: 11, color: "#ffa726", marginLeft: 10 }}>{statusData[cam.id]?.lastError ? `⚠ ${statusData[cam.id].lastError}` : "(Retry in 5s...)"}</span></div>}</div>
                    <div style={{ display: "flex", gap: 20 }}>
                        <div style={{ width: 160, height: 90, background: "#000", border: "1px solid #444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <LivePreview camId={cam.id} BaseURL={API.defaults.baseURL} />
                            <span style={{ position: "absolute", fontSize: 10, color: "#666", zIndex: -1 }}>Preview</span>
                        </div>
                        <div style={{ flex: 1 }}>
                            {/* Stream Settings Header */}
                            <div style={{ display: "grid", gridTemplateColumns: "100px 70px 90px 50px 50px", gap: 10, fontSize: 12, fontWeight: "bold", marginBottom: 5, color: "#aaa" }}>
                                <div></div> {/* Checkbox col */}
                                <div>Codec</div>
                                <div>Resolution</div>
                                <div>GOP</div>
                                <div>FPS</div>
                            </div>

                            {/* Main Stream Row */}
                            <div style={{ display: "grid", gridTemplateColumns: "100px 70px 90px 50px 50px", gap: 10, marginBottom: 10, alignItems: "center" }}>
                                <div><input type="checkbox" checked readOnly style={{ marginRight: 5 }} /> Video</div>
                                <select
                                    style={styles.inputTable}
                                    value={cam.codec || "H.264"}
                                    onChange={e => updateCam(cam.id, "codec", e.target.value)}
                                >
                                    <option>H.264</option>
                                    <option>H.265</option>
                                </select>
                                <select
                                    style={styles.inputTable}
                                    value={cam.resolution || "1080p"}
                                    onChange={e => updateCam(cam.id, "resolution", e.target.value)}
                                >
                                    <option>4K</option>
                                    <option>1080p</option>
                                    <option>720p</option>
                                    <option>VGA</option>
                                </select>
                                <input
                                    style={styles.inputTable}
                                    value={cam.gop || 20}
                                    onChange={e => updateCam(cam.id, "gop", e.target.value)}
                                />
                                <input
                                    style={styles.inputTable}
                                    value={cam.fps || 25}
                                    onChange={e => updateCam(cam.id, "fps", e.target.value)}
                                />
                            </div>

                            {/* Sub Stream Row */}
                            {/* Sub Stream Row */}
                            <div style={{ display: "grid", gridTemplateColumns: "100px 70px 90px 50px 50px", gap: 10, marginBottom: 5, alignItems: "center" }}>
                                <div><input type="checkbox" checked={cam.sub_enabled !== false} onChange={e => { updateCam(cam.id, "sub_enabled", e.target.checked); saveAll(); }} style={{ marginRight: 5 }} /> Sub Stream</div>
                                <select
                                    style={styles.inputTable}
                                    value={cam.sub_codec || "H.264"}
                                    onChange={e => updateCam(cam.id, "sub_codec", e.target.value)}
                                >
                                    <option>H.264</option>
                                    <option>H.265</option>
                                </select>
                                <select
                                    style={styles.inputTable}
                                    value={cam.sub_resolution || "VGA"}
                                    onChange={e => updateCam(cam.id, "sub_resolution", e.target.value)}
                                >
                                    <option>720p</option>
                                    <option>D1</option>
                                    <option>VGA</option>
                                    <option>CIF</option>
                                </select>
                                <input
                                    style={styles.inputTable}
                                    value={cam.sub_gop || 15}
                                    onChange={e => updateCam(cam.id, "sub_gop", e.target.value)}
                                />
                                <input
                                    style={styles.inputTable}
                                    value={cam.sub_fps || 15}
                                    onChange={e => updateCam(cam.id, "sub_fps", e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={styles.container}>
            <div style={styles.main}>
                {renderSidebar()}
                <div style={styles.content}>
                    {renderContent()}
                </div>
            </div>
            {/* Edit Modal / Add Modal */}
            {isEditModalOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#252526", padding: 20, borderRadius: 4, width: 450, border: "1px solid #444" }}>
                        <h3 style={{ marginTop: 0 }}>Setup Connection</h3>
                        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
                            <label>Manufacturer
                                <select style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#fff", padding: 5 }} value={currentEditCam.manufacturer} onChange={e => handleModalChange("manufacturer", e.target.value)}>
                                    {MANUFACTURERS.map(m => <option key={m} value={m}>{m}</option>)}
                                    <option value="Trassir">Trassir</option>
                                    <option value="Generic">Generic</option>
                                    <option value="Generic RTSP">Generic RTSP (Legacy)</option>
                                </select>
                            </label>
                            <label>Model <input style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#fff", padding: 5 }} value={currentEditCam.model || ""} onChange={e => handleModalChange("model", e.target.value)} placeholder="Detected automatically or enter manually" /></label>
                            <label>IP Address <input style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#fff", padding: 5 }} value={currentEditCam.ip} onChange={e => handleModalChange("ip", e.target.value)} /></label>
                            <label>Port <input style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#fff", padding: 5 }} value={currentEditCam.port} onChange={e => handleModalChange("port", e.target.value)} /></label>
                            <label>User <input style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#fff", padding: 5 }} value={currentEditCam.user} onChange={e => handleModalChange("user", e.target.value)} /></label>
                            <label>Password <input type="password" style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#fff", padding: 5 }} value={currentEditCam.pass} onChange={e => handleModalChange("pass", e.target.value)} /></label>

                            {/* DEBUG HELPER: Command / URL Preview */}
                            <div style={{ marginTop: 5, padding: 8, background: "#111", border: "1px solid #333", borderRadius: 4, fontSize: 11, fontFamily: "monospace", color: "#888" }}>
                                <div style={{ fontWeight: "bold", color: "#aaa", marginBottom: 2 }}>STREAM URL PREVIEW (RTSP):</div>
                                <div style={{ wordBreak: "break-all" }}>
                                    {(() => {
                                        const mfgData = DB_MANUFACTURERS.find(m => m.name === currentEditCam.manufacturer) || {};
                                        const tmpl = mfgData.rtspTemplate || "rtsp://${user}:${pass}@${ip}:554/...";

                                        // Sanitize Preview
                                        const safeUser = (currentEditCam.user || "").replace(/\\/g, "");
                                        const safePass = (currentEditCam.pass || "").replace(/\\/g, "");

                                        const url = tmpl
                                            .replace("${user}", safeUser)
                                            .replace("${pass}", safePass)
                                            .replace("${ip}", (currentEditCam.ip || "").replace(/\\/g, "") || "0.0.0.0");

                                        if (currentEditCam.manufacturer === 'Trassir') {
                                            return `rtsp://${safeUser}:${safePass}@${currentEditCam.ip || "0.0.0.0"}:554/live/main`;
                                        }

                                        return url;
                                    })()}
                                </div>
                                {(currentEditCam.user?.includes('\\') || currentEditCam.pass?.includes('\\')) && (
                                    <div style={{ color: "#ff9800", marginTop: 4 }}>
                                        ⚠️ Backslashes detected! They will be auto-removed on Save.
                                    </div>
                                )}
                            </div>

                            <hr style={{ borderColor: "#444", margin: "10px 0", width: "100%" }} />

                            {/* Manual Stream URLs Removed per User Request (Auto-Generated) */}
                            <label>Main Stream URL (Generated/Manual) <input style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#afeeee", padding: 5, fontFamily: 'monospace' }} value={currentEditCam.rtspHd || ""} onChange={e => handleModalChange("rtspHd", e.target.value)} /></label>
                            <label>Sub Stream URL (Generated/Manual) <input style={{ width: "100%", background: "#333", border: "1px solid #555", color: "#afeeee", padding: 5, fontFamily: 'monospace' }} value={currentEditCam.rtsp || ""} onChange={e => handleModalChange("rtsp", e.target.value)} /></label>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
                            <button
                                style={{ ...styles.btnToolbar, background: "#2196f3", color: "#fff", border: "none", flex: 1 }}
                                onClick={async () => {
                                    setVerificationStatus("verifying");
                                    try {
                                        // Clean IP/User/Pass
                                        const cleanCam = { ...currentEditCam };
                                        ['ip', 'user', 'pass'].forEach(k => { if (cleanCam[k]) cleanCam[k] = cleanCam[k].replace(/\\/g, ""); });

                                        const verifyRes = await API.post("/cameras/probe", {
                                            ip: cleanCam.ip, port: cleanCam.port, user: cleanCam.user, pass: cleanCam.pass, manufacturer: cleanCam.manufacturer
                                        });
                                        const probeData = verifyRes.data;
                                        // Apply detected data
                                        if (probeData.port) cleanCam.port = probeData.port;
                                        if (probeData.manufacturer) cleanCam.manufacturer = probeData.manufacturer;
                                        if (probeData.model) cleanCam.model = probeData.model;
                                        if (probeData.channels > 0) cleanCam.channels = probeData.channels;
                                        if (probeData.mainStream) cleanCam.rtspHd = probeData.mainStream;
                                        if (probeData.subStream) cleanCam.rtsp = probeData.subStream;

                                        setCurrentEditCam(cleanCam);
                                        setVerificationStatus(null);
                                        alert("✅ Conexiune REUȘITĂ!\n\nCamera a fost detectată cu succes:\nBrand: " + (probeData.manufacturer || "N/A") + "\nModel: " + (probeData.model || "N/A") + "\n\nApăsați 'Salvează' și apoi 'Upload Changes' pentru a finaliza.");
                                    } catch (e) {
                                        setVerificationStatus(null);
                                        alert("Detect Failed: " + (e.response?.data?.error || e.message));
                                    }
                                }}
                                disabled={verificationStatus === "verifying"}
                            >
                                {verificationStatus === "verifying" ? "Se detectează..." : "📡 Detectează (Probe)"}
                            </button>
                            <button
                                style={{ ...styles.btnToolbar, background: "#4caf50", color: "#fff", border: "none", flex: 1 }}
                                onClick={saveEditModal}
                                disabled={verificationStatus === "verifying"}
                            >
                                Salvează
                            </button>
                            <button style={{ ...styles.btnToolbar, width: 80 }} onClick={closeEditModal}>Anulează</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}