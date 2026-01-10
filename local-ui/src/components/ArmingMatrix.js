import React, { useState, useEffect } from "react";

const ArmingMatrix = ({ schedules, cams, assignments, modes, labels, onSave, onSaveModes, onSaveLabels, onToggleSchedule }) => {
    const [localAssignments, setLocalAssignments] = useState(assignments || {});
    const [localModes, setLocalModes] = useState(modes || {
        "ARMED_AWAY": false,
        "ARMED_HOME": false,
        "ARMED_NIGHT": false,
        "DISARMED": true
    });
    const [localLabels, setLocalLabels] = useState(labels || {
        "ARMED_AWAY": "Away",
        "ARMED_HOME": "Home",
        "ARMED_NIGHT": "Night"
    });

    useEffect(() => {
        setLocalAssignments(assignments || {});
    }, [assignments]);

    // Handle Assignment Change with AUTO-SAVE
    const handleAssign = (camId, value) => {
        const updated = { ...localAssignments, [camId]: value };
        setLocalAssignments(updated);
        onSave(updated); // Trigger immediate save
    };

    // Toggle Mode with AUTO-SAVE
    const toggleMode = (key) => {
        const updated = { ...localModes, [key]: !localModes[key] };
        setLocalModes(updated);
        onSaveModes(updated); // Trigger immediate save
    };

    return (
        <div style={{ padding: 20, color: "#ccc", height: "100%", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>Arming Configuration</h2>
                <div style={{ fontSize: 12, color: "#4caf50", fontStyle: "italic" }}>
                    Changes are saved automatically.
                </div>
            </div>

            {/* MODES & LABELS */}
            <div style={{ background: "#252526", padding: 15, marginBottom: 20, border: "1px solid #444" }}>
                <h3 style={{ marginTop: 0 }}>System Modes</h3>
                <p style={{ fontSize: 13, color: "#888" }}>Define which global modes are currently ACTIVE. Cameras assigned to a mode will only arm if that mode is active.</p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 15 }}>
                    {["ARMED_AWAY", "ARMED_HOME", "ARMED_NIGHT"].map(key => (
                        <div key={key} style={{ background: "#1e1e1e", padding: 10, borderLeft: localModes[key] ? "4px solid #4caf50" : "4px solid #f44336" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                                <input
                                    value={localLabels[key] || key}
                                    onChange={(e) => setLocalLabels({ ...localLabels, [key]: e.target.value })}
                                    style={{ background: "transparent", border: "none", color: "#fff", fontWeight: "bold", borderBottom: "1px solid #444" }}
                                />
                                <div
                                    onClick={() => toggleMode(key)}
                                    style={{
                                        cursor: "pointer",
                                        padding: "2px 8px",
                                        borderRadius: 4,
                                        background: localModes[key] ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.2)",
                                        color: localModes[key] ? "#4caf50" : "#f44336",
                                        fontSize: 11, fontWeight: "bold"
                                    }}
                                >
                                    {localModes[key] ? "ACTIVE" : "INACTIVE"}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>


            {/* DEFINED SCHEDULES */}
            <div style={{ background: "#252526", padding: 15, marginBottom: 20, border: "1px solid #444" }}>
                <h3 style={{ marginTop: 0 }}>Active Schedules</h3>
                <p style={{ fontSize: 13, color: "#888" }}>Time-based automation schedules. Assign cameras below.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 15 }}>
                    {(() => {
                        const scheds = Array.isArray(schedules)
                            ? schedules.map((s, i) => ({ id: i.toString(), ...s }))
                            : Object.entries(schedules || {}).map(([k, v]) => ({ id: k, ...v }));

                        if (scheds.length === 0) return <div style={{ color: "#777" }}>No schedules defined.</div>;

                        return scheds.map((sch, realIdx) => (
                            <div key={sch.id} style={{ background: "#1e1e1e", padding: 10, borderLeft: sch.enabled !== false ? "4px solid #4caf50" : "4px solid #f44336" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                                    <div style={{ fontWeight: "bold", color: "#fff" }}>{sch.name || "Untitled Schedule"}</div>
                                    <div
                                        onClick={() => onToggleSchedule && onToggleSchedule(realIdx, sch.enabled !== false)}
                                        style={{ cursor: "pointer", fontSize: 11, background: sch.enabled !== false ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.2)", color: sch.enabled !== false ? "#4caf50" : "#f44336", padding: "2px 6px", borderRadius: 4, display: "flex", alignItems: "center" }}
                                    >
                                        {sch.enabled !== false ? "ACTIVE" : "DISABLED"}
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: "#aaa" }}>
                                    {(sch.days || []).join(", ") || "Every Day"} <br />
                                    {(sch.intervals || []).map(i => `${i.start}-${i.end}`).join(", ") || "24/7"}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            </div>

            {/* ASSIGNMENT MATRIX */}
            <div style={{ background: "#252526", padding: 15, border: "1px solid #444" }}>
                <h3 style={{ marginTop: 0 }}>Camera Assignments</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: "#333" }}>
                            <th style={{ padding: 10, textAlign: "left" }}>Camera</th>
                            <th style={{ padding: 10, textAlign: "left" }}>Arming Strategy</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cams.map(cam => (
                            <tr key={cam.id} style={{ borderBottom: "1px solid #333" }}>
                                <td style={{ padding: 10 }}>
                                    <div style={{ fontWeight: "bold" }}>{cam.name || cam.ip}</div>
                                    <div style={{ fontSize: 11, color: "#777" }}>{cam.ip}</div>
                                </td>
                                <td style={{ padding: 10 }}>
                                    <select
                                        value={localAssignments[cam.id] || "DISARMED"}
                                        onChange={(e) => handleAssign(cam.id, e.target.value)}
                                        style={{ background: "#1e1e1e", color: "#fff", border: "1px solid #555", padding: 6, width: "100%", maxWidth: 300 }}
                                    >
                                        <option value="DISARMED">⛔ Disarmed (Never)</option>
                                        <optgroup label="Follow Global Mode">
                                            {["ARMED_AWAY", "ARMED_HOME", "ARMED_NIGHT"].map(m => (
                                                <option key={m} value={m}>Follow '{localLabels[m] || m}'</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Schedules">
                                            {Object.entries(schedules).map(([id, sch]) => (
                                                <option key={id} value={id}>📅 {sch.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div >
    );
};

export default ArmingMatrix;
