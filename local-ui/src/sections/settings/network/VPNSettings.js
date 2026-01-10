import React, { useState } from "react";
import { Lock } from "../../../components/Icons"; // Adjust path .. .. ..
import { colors, styles } from "./styles";

export function VPNSettings({ netConfig, setNetConfig, connectVPN, connectDualVPN, saveImportedVPN }) {
    const [vpnTab, setVpnTab] = useState("wg0");
    const prefix = vpnTab;
    const getConf = (k) => netConfig[`${prefix}_${k}`];
    const setConf = (k, v) => setNetConfig({ ...netConfig, [`${prefix}_${k}`]: v });

    const status = getConf("status");
    const isConnected = status && status.includes("Connected");

    const handleImportConfig = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const bundle = JSON.parse(event.target.result);
                if (!bundle.mgmt || !bundle.ai) throw new Error("Format fișier invalid (Pachet Dual VPN necesar)");

                const newCfg = { ...netConfig };

                // Map Management (wg0)
                newCfg.wg0_address = bundle.mgmt.interface.address;
                newCfg.wg0_privateKey = bundle.mgmt.interface.privateKey;
                newCfg.wg0_serverPubKey = bundle.mgmt.peer.publicKey;
                newCfg.wg0_endpoint = bundle.mgmt.peer.endpoint;
                newCfg.wg0_allowedIps = bundle.mgmt.peer.allowedIps;

                // Map AI (wg1)
                newCfg.wg1_address = bundle.ai.interface.address;
                newCfg.wg1_privateKey = bundle.ai.interface.privateKey;
                newCfg.wg1_serverPubKey = bundle.ai.peer.publicKey;
                newCfg.wg1_endpoint = bundle.ai.peer.endpoint;
                newCfg.wg1_allowedIps = bundle.ai.peer.allowedIps;

                setNetConfig(newCfg);

                // Auto-Apply if the handler is provided
                if (saveImportedVPN) {
                    if (window.confirm("Configurație validă! Doriți să aplicați setările pentru AMBELE tuneluri VPN acum?")) {
                        saveImportedVPN(bundle);
                    }
                } else {
                    alert("Configurație VPN importată în memorie! Apăsați 'Update & Connect'.");
                }

            } catch (err) {
                alert("Eroare la citirea fișierului: " + err.message);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>VPN Configuration (Dual WireGuard)</h2>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <button
                    onClick={() => setVpnTab("wg0")}
                    style={{
                        padding: "10px 20px",
                        background: vpnTab === "wg0" ? "#007acc" : "#333",
                        color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold",
                        borderBottom: vpnTab === "wg0" ? "2px solid #fff" : "none"
                    }}
                >
                    <Lock size={14} style={{ marginRight: 5 }} /> VPN #1 (Management)
                </button>
                <button
                    onClick={() => setVpnTab("wg1")}
                    style={{
                        padding: "10px 20px",
                        background: vpnTab === "wg1" ? "#e91e63" : "#333",
                        color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold",
                        borderBottom: vpnTab === "wg1" ? "2px solid #fff" : "none"
                    }}
                >
                    [AI] VPN #2 (AI Stream)
                </button>
            </div>

            <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 600 }}>
                <div style={{ marginBottom: 20, padding: 10, background: isConnected ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)", border: "1px solid #444", borderRadius: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: "bold", color: isConnected ? "#4caf50" : "#f44336" }}>
                            Interface: {prefix.toUpperCase()} | Status: {status || "Not Configured"}
                        </div>
                        <div>
                            <input
                                type="file"
                                id="vpn-import"
                                accept=".json"
                                style={{ display: "none" }}
                                onChange={handleImportConfig}
                            />
                            <button
                                onClick={() => document.getElementById('vpn-import').click()}
                                style={{ background: "#2e7d32", color: "#fff", border: "1px solid #4caf50", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: "bold" }}
                            >
                                📂 Importă VPN (.json)
                            </button>
                        </div>
                    </div>
                    {getConf("ip") && <div style={{ fontSize: 13, color: "#ccc", marginTop: 5 }}>Internal IP: <b style={{ color: "#fff" }}>{getConf("ip")}</b></div>}
                </div>

                <h3 style={{ fontSize: 14, color: "#aaa", borderBottom: "1px solid #444", paddingBottom: 5 }}>
                    {vpnTab === "wg0" ? "Management Tunnel Settings" : "High-Speed AI Tunnel Settings"}
                </h3>

                <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", color: "#ccc", fontSize: 12 }}>IP Address (Client)</label>
                    <input style={{ ...styles.input, width: "100%", fontFamily: "monospace" }}
                        value={getConf("address") || ""}
                        onChange={e => setConf("address", e.target.value)}
                        placeholder={vpnTab === "wg0" ? "10.100.0.x/16" : "10.100.1.x/16"}
                    />
                </div>
                <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", color: "#ccc", fontSize: 12 }}>Private Key (Client)</label>
                    <input style={{ ...styles.input, width: "100%", fontFamily: "monospace" }} type="password"
                        value={getConf("privateKey") || ""}
                        onChange={e => setConf("privateKey", e.target.value)}
                        placeholder="Client Private Key"
                    />
                </div>
                <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", color: "#ccc", fontSize: 12 }}>Public Key (Server)</label>
                    <input style={{ ...styles.input, width: "100%", fontFamily: "monospace" }}
                        value={getConf("serverPubKey") || ""}
                        onChange={e => setConf("serverPubKey", e.target.value)}
                        placeholder="Server Public Key"
                    />
                </div>
                <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", color: "#ccc", fontSize: 12 }}>Endpoint (Server IP:Port)</label>
                    <input style={{ ...styles.input, width: "100%", fontFamily: "monospace" }}
                        value={getConf("endpoint") || ""}
                        onChange={e => setConf("endpoint", e.target.value)}
                        placeholder={vpnTab === "wg0" ? "194.107.163.227:51820" : "194.107.163.227:51821"}
                    />
                </div>
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", color: "#ccc", fontSize: 12 }}>Allowed IPs</label>
                    <input style={{ ...styles.input, width: "100%", fontFamily: "monospace" }}
                        value={getConf("allowedIps") || ""}
                        onChange={e => setConf("allowedIps", e.target.value)}
                        placeholder={vpnTab === "wg0" ? "10.100.0.0/16" : "10.100.1.0/24"}
                    />
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                    <button
                        style={{ ...styles.btnPrimary, flex: 2 }}
                        onClick={() => connectVPN(vpnTab)}
                    >
                        Update & Connect {vpnTab.toUpperCase()}
                    </button>

                    {netConfig.wg1_privateKey && (
                        <button
                            style={{ ...styles.btnPrimary, flex: 3, background: "#ff9800", color: "#000" }}
                            onClick={connectDualVPN}
                        >
                            ⚡ Connect ALL VPN Tunnels (Dual)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
