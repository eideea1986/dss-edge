import React, { useEffect, useState } from "react";
import API from "../api";
// Lucide-react not available, using text fallbacks or simple SVGs if needed.

// Helper Icons (Text-based for maximum compatibility with encoding)
const IconCpu = () => <span style={{ marginRight: 8 }}>[CPU]</span>;
const IconGpu = () => <span style={{ marginRight: 8 }}>[GPU]</span>;
const IconRam = () => <span style={{ marginRight: 8 }}>[RAM]</span>;
const IconNet = () => <span style={{ marginRight: 8 }}>[NET]</span>;
const IconHdd = () => <span style={{ marginRight: 8 }}>[HDD]</span>;

export default function Status() {
    const [info, setInfo] = useState(null);
    const [hwInfo, setHwInfo] = useState(null);
    const [loadingHw, setLoadingHw] = useState(true);

    const load = async () => {
        try {
            const res = await API.get("status");
            setInfo(res.data);
            setLoadingHw(false);
        } catch (err) {
            console.error("Status fetch error", err);
        }
    };

    const scanHardware = async () => {
        setLoadingHw(true);
        try {
            const hwRes = await API.get("status/hardware");
            setHwInfo(hwRes.data);
        } catch (err) {
            console.error("Hardware scan error", err);
        }
        setLoadingHw(false);
    };

    useEffect(() => {
        load();
        const interval = setInterval(() => {
            API.get("status").then(res => setInfo(res.data)).catch(() => { });
        }, 5000); // 5s interval is better responsiveness than 10s

        return () => clearInterval(interval);
    }, []);

    if (!info) return (
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
            <div className="skeleton" style={{ width: 200, height: 20, background: "#444", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
        </div>
    );

    // Derived Stats (with defensive checks)
    const ram = info.ram || { total: 0, free: 0 };
    const ramUsed = ram.total - ram.free;
    const ramTotalGB = (ram.total / 1024 / 1024 / 1024).toFixed(1);
    const ramUsedGB = (ramUsed / 1024 / 1024 / 1024).toFixed(1);
    const ramPct = ram.total > 0 ? Math.round((ramUsed / ram.total) * 100) : 0;

    const cpuVal = (info.cpu && Array.isArray(info.cpu)) ? (info.cpu[0] || 0) : 0;
    const gpuVal = hwInfo?.gpuLoad || 0;
    const diskPct = info.disk?.usedPercent || 0;

    return (
        <div style={{ padding: "20px 30px", background: "#121212", minHeight: "100%", color: "#e0e0e0", fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}>

            {/* Header Area */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 25, borderBottom: "1px solid #333", paddingBottom: 15 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                    <div style={{ fontSize: 24, padding: "5px 10px", background: "#333", borderRadius: 4 }}>SYS</div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, color: "#fff", fontWeight: 600, letterSpacing: 0.5 }}>SYSTEM STATUS</h1>
                        <div style={{ fontSize: 13, color: "#666", display: "flex", gap: 15, marginTop: 4 }}>
                            <span><b>v2.1 PRO</b> Display</span>
                            <span>•</span>
                            <span>Uptime: <b style={{ color: "#4caf50" }}>{Math.floor(info.uptime / 3600)}h {Math.floor((info.uptime % 3600) / 60)}m</b></span>
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <ActionButton
                        color="#f44336"
                        label="Restart Services"
                        onClick={async () => {
                            if (window.confirm("ATENTIE: Serviciile de inregistrare si live view se vor opri temporar. Continuati?")) {
                                await API.post("status/restart-service");
                            }
                        }}
                    />
                    <ActionButton
                        color="#2196f3"
                        label="Quick Diagnose"
                        onClick={async () => {
                            await API.post("status/fix-deps");
                            alert("Diagnosticare pornita in background.");
                        }}
                    />
                </div>
            </div>

            {/* KPI Row - High Level Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 25 }}>
                <KPICard
                    title="CPU LOAD (1m)"
                    value={cpuVal}
                    unit="%"
                    pct={cpuVal}
                    color={cpuVal > 80 ? "#f44336" : (cpuVal > 50 ? "#ff9800" : "#4caf50")}
                    icon={<IconCpu />}
                    sub={`Model: ${hwInfo?.cpu ? hwInfo.cpu.split('@')[0].trim() : "..."}`}
                />
                <KPICard
                    title="GPU DECODE"
                    value={gpuVal}
                    unit="%"
                    pct={gpuVal}
                    color={gpuVal > 80 ? "#f44336" : "#e91e63"}
                    icon={<IconGpu />}
                    sub={hwInfo?.gpu || "Integrated"}
                />
                <KPICard
                    title="MEMORY RAM"
                    value={ramPct}
                    unit="%"
                    pct={ramPct}
                    color="#2196f3"
                    icon={<IconRam />}
                    sub={`${ramUsedGB} / ${ramTotalGB} GB Active`}
                />
                <KPICard
                    title="STORAGE (ROOT)"
                    value={diskPct}
                    unit="%"
                    pct={diskPct}
                    color={diskPct > 90 ? "#f44336" : "#9c27b0"}
                    icon={<IconHdd />}
                    sub={`Free: ${info.disk?.avail || "?"}`}
                />
            </div>

            {/* Main Dashboard Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr", gap: 20 }}>

                {/* Left Column: Detailed Hardware & OS */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <SectionCard title="HARDWARE COMPOSITION">
                        {!hwInfo && !loadingHw ? (
                            <div style={{ padding: 20, textAlign: "center" }}>
                                <div style={{ color: "#666", marginBottom: 15, fontSize: 13 }}>Hardware details are collected on demand to save resources.</div>
                                <button
                                    onClick={scanHardware}
                                    style={{
                                        padding: "8px 20px", background: "#2196f3", color: "white",
                                        border: "none", borderRadius: 4, fontSize: 13, cursor: "pointer", fontWeight: "bold"
                                    }}
                                >
                                    Scan System Hardware
                                </button>
                            </div>
                        ) : loadingHw ? (
                            <div style={{ padding: 20, color: "#666", textAlign: "center" }}>
                                <div className="spinner" style={{ marginBottom: 10 }}>[WAIT]</div>
                                Scanning hardware layer...
                            </div>
                        ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                                <tbody>
                                    <TableRow label="Motherboard" value={hwInfo?.motherboard} />
                                    <TableRow label="Processor SKU" value={hwInfo?.cpu} highlight />
                                    <TableRow label="Graphics Unit" value={hwInfo?.gpu || "N/A"} />
                                    <TableRow label="Total Memory" value={hwInfo?.ram} />
                                    <TableRow label="Kernel Version" value={hwInfo?.kernel} />
                                    <TableRow label="OS Distro" value={hwInfo?.os} />
                                </tbody>
                            </table>
                        )}
                    </SectionCard>

                    <SectionCard title="MODULE HEALTH">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                            {info.modules && Object.entries(info.modules).map(([name, installed]) => (
                                <div key={name} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "12px 15px", background: "#1e1e1e", borderRadius: 6,
                                    borderLeft: `4px solid ${installed ? "#4caf50" : "#f44336"}`
                                }}>
                                    <span style={{ fontWeight: 500, textTransform: "capitalize", fontSize: 14 }}>{name.replace("-", " ")}</span>
                                    <span style={{
                                        fontSize: 11, fontWeight: "bold",
                                        padding: "2px 8px", borderRadius: 10,
                                        background: installed ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)",
                                        color: installed ? "#4caf50" : "#f44336"
                                    }}>
                                        {installed ? "RUNNING" : "STOPPED"}
                                    </span>
                                </div>
                            ))}
                            <div style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "12px 15px", background: "#1e1e1e", borderRadius: 6,
                                borderLeft: `4px solid ${info.storageMap ? "#4caf50" : "#ffa726"}`
                            }}>
                                <span style={{ fontWeight: 500, fontSize: 14 }}>Retention Engine</span>
                                <span style={{ color: info.storageMap ? "#4caf50" : "#ffa726", fontSize: 11, fontWeight: "bold" }}>
                                    {info.storageMap ? "ACTIVE" : "NO MAP"}
                                </span>
                            </div>
                        </div>
                    </SectionCard>
                </div>

                {/* Right Column: Network & Logs */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <SectionCard title="NETWORK INTERFACES">
                        {hwInfo?.network?.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {hwInfo.network.map((net, i) => (
                                    <div key={i} style={{ background: "#1a1a1a", padding: 15, borderRadius: 6, border: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: "bold", color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                                                <IconNet /> {net.name}
                                            </div>
                                            <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{net.brand}</div>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontFamily: "monospace", color: "#81d4fa", fontSize: 13, background: "rgba(33, 150, 243, 0.1)", padding: "2px 6px", borderRadius: 4 }}>
                                                {net.mac}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div style={{ fontSize: 12, color: "#666", marginTop: 5, paddingLeft: 5 }}>
                                    DNS: {hwInfo?.dns.join(", ") || "Auto"}
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: 20, color: "#666" }}>Scanning network adapters...</div>
                        )}
                    </SectionCard>

                    <div style={{ marginTop: 10 }}>
                        <h4 style={{ fontSize: 12, textTransform: "uppercase", color: "#666", marginBottom: 10 }}>System Logs</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <LogButton label="Recorder.log" href={`${API.defaults.baseURL}/status/recorder-logs`} />
                            <LogButton label="CameraMgr.log" href={`${API.defaults.baseURL}/status/camera-logs`} />
                            <LogButton label="AI_Engine.log" href={`${API.defaults.baseURL}/status/ai-logs`} />
                            <LogButton label="Journalctl -u" href={`${API.defaults.baseURL}/status/journal`} warning />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Sub-components for Cleaner Layout

const ActionButton = ({ label, onClick, color }) => (
    <button onClick={onClick} style={{
        background: "transparent", border: `1px solid ${color}`, color: color,
        padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600,
        transition: "all 0.2s",
        textTransform: "uppercase"
    }} onMouseEnter={e => e.target.style.background = `rgba(${parseInt(color.slice(1, 3), 16)},0,0,0.1)`} onMouseLeave={e => e.target.style.background = "transparent"}>
        {label}
    </button>
);

const KPICard = React.memo(({ title, value, unit, pct, color, icon, sub }) => (
    <div style={{ background: "#1e1e1e", padding: 20, borderRadius: 8, borderTop: `3px solid ${color}`, boxShadow: "0 4px 10px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: 1 }}>{title}</div>
            <div style={{ color: color, fontSize: 18 }}>{icon}</div>
        </div>
        <div style={{ fontSize: 32, fontWeight: "bold", color: "#fff", lineHeight: 1 }}>
            {value}<span style={{ fontSize: 16, color: "#666", marginLeft: 4 }}>{unit}</span>
        </div>

        <div style={{ width: "100%", background: "#333", height: 4, borderRadius: 2, marginTop: 15, marginBottom: 8 }}>
            <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2 }} />
        </div>

        <div style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {sub}
        </div>
    </div>
));


const SectionCard = React.memo(({ title, children }) => (
    <div style={{ background: "#1e1e1e", borderRadius: 8, border: "1px solid #2a2a2a", overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", background: "#252526", borderBottom: "1px solid #2a2a2a", fontSize: 12, fontWeight: 700, color: "#aaa", letterSpacing: 1 }}>
            {title}
        </div>
        <div style={{ padding: 20 }}>
            {children}
        </div>
    </div>
));

const TableRow = React.memo(({ label, value, highlight }) => (
    <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
        <td style={{ padding: "10px 0", color: "#888", fontSize: 13 }}>{label}</td>
        <td style={{ padding: "10px 0", textAlign: "right", color: highlight ? "#fff" : "#ccc", fontWeight: highlight ? 600 : 400 }}>
            {value || <span style={{ opacity: 0.3 }}>-</span>}
        </td>
    </tr>
));

const LogButton = ({ label, href, warning }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{
        display: "block", textAlign: "center", padding: "10px",
        background: warning ? "rgba(244, 67, 54, 0.1)" : "#222",
        color: warning ? "#f44336" : "#aaa",
        textDecoration: "none", fontSize: 12, borderRadius: 4,
        border: `1px solid ${warning ? "rgba(244, 67, 54, 0.3)" : "#333"}`
    }}>
        {label}
    </a>
);
