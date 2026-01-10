import React from "react";
import { styles } from "./styles";

export function SystemPortsSection() {
    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>System Port Usage</h2>
            <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 800 }}>
                <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Serviciu</th><th style={styles.th}>Port</th><th style={styles.th}>Protocol</th><th style={styles.th}>Descriere</th></tr></thead>
                    <tbody>
                        <tr><td style={styles.td}>Interfata Web</td><td style={styles.td}>80</td><td style={styles.td}>TCP</td><td style={styles.td}>Acces Panou Control</td></tr>
                        <tr><td style={styles.td}>API Local</td><td style={styles.td}>3000</td><td style={styles.td}>TCP</td><td style={styles.td}>Backend Intern</td></tr>
                        <tr><td style={styles.td}>SSH</td><td style={styles.td}>22</td><td style={styles.td}>TCP</td><td style={styles.td}>Administrare</td></tr>
                        <tr><td style={styles.td}>WireGuard</td><td style={styles.td}>51820/51821</td><td style={styles.td}>UDP</td><td style={styles.td}>VPN Tunnels</td></tr>
                        <tr><td style={styles.td}>RTSP</td><td style={styles.td}>554/8554</td><td style={styles.td}>TCP/UDP</td><td style={styles.td}>Video Streams</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
