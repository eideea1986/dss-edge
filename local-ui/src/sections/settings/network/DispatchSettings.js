import React, { useState } from "react";
import { API } from "../../../api";
import { colors, styles } from "./styles";

export function DispatchSettings({ netConfig, setNetConfig, saveDispatch }) {
    const [syncing, setSyncing] = useState(false);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await API.post("/dispatch/sync");
            alert("Sync Result: " + res.data.message);
        } catch (e) {
            alert("Sync Failed: " + (e.response?.data?.error || e.message));
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Evenimente Server (Dispatch)</h2>
            <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 600 }}>
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 5 }}>Dispatch URL (Primary)</label>
                    <input
                        style={{ ...styles.input, width: "100%", maxWidth: "100%", fontFamily: "monospace" }}
                        value={netConfig.dispatchUrl || ""}
                        onChange={e => setNetConfig({ ...netConfig, dispatchUrl: e.target.value })}
                        placeholder="http://dispatch.example.com/events"
                    />
                </div>

                <div style={{ marginBottom: 20 }}>
                    <button style={styles.btnPrimary} onClick={saveDispatch}>Save Dispatch Config</button>
                    <button
                        style={{ ...styles.btnToolbar, background: "#4caf50", color: "#fff", border: "none" }}
                        onClick={handleSync}
                        disabled={syncing}
                    >
                        {syncing ? "Syncing..." : "Sync Now (Manual)"}
                    </button>
                </div>

                <div style={{ borderTop: "1px solid #444", paddingTop: 15, marginTop: 15 }}>
                    <h4 style={{ margin: "0 0 10px 0", color: "#888", fontSize: 12 }}>Active Connection Status</h4>
                    <div style={{ fontSize: 13, display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ width: 10, height: 10, background: (netConfig.vpn_status === "Connected") ? "#4caf50" : "#f44336", borderRadius: "50%" }}></div>
                        <span>VPN: {netConfig.vpn_status || "Disconnected"}</span>
                    </div>
                    <div style={{ fontSize: 13, display: "flex", gap: 10, alignItems: "center", marginTop: 5 }}>
                        <div style={{ width: 10, height: 10, background: (netConfig.wg1_status === "Connected") ? "#e91e63" : "#555", borderRadius: "50%" }}></div>
                        <span>AI HUB: {netConfig.wg1_status === "Connected" ? "Active (10.200.0.2)" : "Searching..."}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
