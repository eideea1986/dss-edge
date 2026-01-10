import React, { useState, useEffect } from "react";
import { colors, styles } from "./styles"; // Shared Styles

export function InterfaceSettings({ networkConfig, setNetworkConfig, saveNetwork }) {
    const [ifaceTab, setIfaceTab] = useState(0);
    const isManual = networkConfig.mode === "manual";
    const interfaces = networkConfig.availableInterfaces || [];
    const activeIface = interfaces[ifaceTab] || interfaces[0];

    // Helper to sync state with selected interface
    const syncToInterface = (iface, idx) => {
        setIfaceTab(idx);
        setNetworkConfig(prev => ({
            ...prev,
            interface: iface.interface,
            ip: iface.ip || "",
            netmask: iface.netmask || "255.255.255.0",
            gateway: iface.gateway || "",
            dns1: iface.dns1 || "",
            dns2: iface.dns2 || ""
        }));
    };

    // Auto-Select First Interface on Load if not set
    useEffect(() => {
        if (interfaces.length > 0 && !networkConfig.interface) {
            syncToInterface(interfaces[0], 0);
        }
    }, [interfaces]);

    const handleTabClick = (idx) => {
        const sel = interfaces[idx];
        syncToInterface(sel, idx);
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Interface Settings (IPv4/IPv6)</h2>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {Array.isArray(interfaces) && interfaces.map((video, idx) => (
                    <button
                        key={idx}
                        onClick={() => handleTabClick(idx)}
                        style={{
                            padding: "8px 16px",
                            background: ifaceTab === idx ? "#ff9800" : "#333",
                            color: ifaceTab === idx ? "#000" : "#ccc",
                            border: "none", cursor: "pointer", fontWeight: "bold", borderRadius: 4
                        }}
                    >
                        {video.interface} ({video.ip || "No IP"})
                    </button>
                ))}
            </div>

            <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 700 }}>
                <div style={{ marginBottom: 15, borderBottom: "1px solid #444", paddingBottom: 10, fontWeight: "bold", color: "#ddd", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Configuration for <span style={{ color: "#ff9800" }}>{activeIface?.interface}</span></span>
                    <span style={{ fontSize: 12, color: '#aaa', background: '#333', padding: '2px 6px', borderRadius: 4 }}>{activeIface?.family || "IPv4"}</span>
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
                    <div style={styles.formGrid}><label style={styles.label}>IPv4 Address:</label><input style={styles.input} value={networkConfig.ip || ""} onChange={e => setNetworkConfig({ ...networkConfig, ip: e.target.value })} placeholder="192.168.1.50" /></div>
                    <div style={styles.formGrid}><label style={styles.label}>Netmask:</label><input style={styles.input} value={networkConfig.netmask || ""} onChange={e => setNetworkConfig({ ...networkConfig, netmask: e.target.value })} placeholder="255.255.255.0" /></div>
                    <div style={styles.formGrid}><label style={styles.label}>Gateway (Global):</label><input style={styles.input} value={networkConfig.gateway || ""} onChange={e => setNetworkConfig({ ...networkConfig, gateway: e.target.value })} placeholder="192.168.1.1" /></div>
                    <div style={styles.formGrid}><label style={styles.label}>DNS Server 1:</label><input style={styles.input} value={networkConfig.dns1 || ""} onChange={e => setNetworkConfig({ ...networkConfig, dns1: e.target.value })} placeholder="8.8.8.8" /></div>
                    <div style={styles.formGrid}><label style={styles.label}>DNS Server 2:</label><input style={styles.input} value={networkConfig.dns2 || ""} onChange={e => setNetworkConfig({ ...networkConfig, dns2: e.target.value })} placeholder="8.8.4.4" /></div>
                </div>
                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                    <button style={styles.btnPrimary} onClick={saveNetwork}>
                        Save Settings for {activeIface?.interface}
                    </button>
                </div>
            </div>
        </div>
    );
}
