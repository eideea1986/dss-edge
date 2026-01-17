import React, { useState, useEffect } from 'react';
import { colors } from '../theme';

const API_ROOT = window.location.hostname === 'localhost' ? 'http://localhost:8080' : '';

export default function SystemStatus() {
    const [health, setHealth] = useState(null);

    useEffect(() => {
        const fetchHealth = () => {
            fetch(`${API_ROOT}/api/system/health`)
                .then(r => r.json())
                .then(data => setHealth(data))
                .catch(e => console.error("Health fetch failed", e));
        };

        fetchHealth();
        const timer = setInterval(fetchHealth, 5000);
        return () => clearInterval(timer);
    }, []);

    if (!health) return null;

    const getStatusColor = (status) => status === 'OK' ? '#4CAF50' : '#F44336';

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginRight: "20px",
            padding: "4px 10px",
            background: "rgba(0,0,0,0.2)",
            borderRadius: "4px",
            fontSize: "12px"
        }}>
            <div style={{ color: "#888", fontWeight: "bold", textTransform: "uppercase", fontSize: "10px" }}>System:</div>

            {/* Legend: REC, LIVE, IDX, RET, API */}
            <StatusDot label="REC" status={health.modules.recorder?.status} />
            <StatusDot label="LIVE" status={health.modules.live?.status} />
            <StatusDot label="IDX" status={health.modules.indexer?.status} />
            <StatusDot label="RET" status={health.modules.retention?.status} />

            {/* New: VPN Tunnels */}
            <StatusDot label="VPN-D" status={health.vpn?.dispatch} />
            <StatusDot label="VPN-A" status={health.vpn?.ai} />

            <div style={{
                marginLeft: "10px",
                padding: "2px 6px",
                borderRadius: "3px",
                background: health.disk > 90 ? "#F44336" : "rgba(255,255,255,0.1)",
                color: "#fff",
                fontWeight: "bold",
                fontSize: "10px"
            }}>
                HDD: {health.disk}%
            </div>

            <div style={{
                marginLeft: "5px",
                color: health.system === 'RUNNING' ? colors.primary : '#FF9800',
                fontWeight: "bold"
            }}>
                {health.system}
            </div>
        </div>
    );
}

function StatusDot({ label, status }) {
    const color = status === 'OK' ? '#4CAF50' : '#F44336';
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }} title={`${label}: ${status}`}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}` }}></div>
            <span style={{ fontSize: "9px", color: "#aaa" }}>{label}</span>
        </div>
    );
}
