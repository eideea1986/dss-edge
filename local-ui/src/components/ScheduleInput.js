import React, { useState, useEffect } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const ScheduleEditor = ({ schedules, onSave }) => {
    // Initialize state by converting input array to object map keyed by ID
    // Also converts legacy 'slots' to 'matrix' (48 slots)
    const [localSchedules, setLocalSchedules] = useState({});
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        const init = {};
        const inputList = Array.isArray(schedules) ? schedules : Object.values(schedules || {});

        inputList.forEach(s => {
            const id = s.id || "sch_" + Math.random().toString(36).substr(2, 9);

            // Ensure matrix exists (48 slots per day)
            let matrix = s.matrix;

            // Migration: Slots to Matrix
            if (!matrix && s.slots) {
                matrix = {};
                for (let d = 0; d < 7; d++) {
                    matrix[d] = Array(48).fill(0);
                    if (s.slots[d]) {
                        s.slots[d].forEach(h => {
                            if (h >= 0 && h < 24) {
                                matrix[d][h * 2] = 1;
                                matrix[d][h * 2 + 1] = 1;
                            }
                        });
                    }
                }
            }

            // Default empty matrix
            if (!matrix) {
                matrix = {};
                for (let d = 0; d < 7; d++) matrix[d] = Array(48).fill(0);
            } else {
                // Ensure all days exist
                for (let d = 0; d < 7; d++) {
                    if (!matrix[d]) matrix[d] = Array(48).fill(0);
                }
            }

            init[id] = { ...s, id, matrix, slots: undefined }; // Use matrix primarily
        });

        // If no schedules, create default
        if (Object.keys(init).length === 0) {
            const newId = "sch_" + Date.now();
            const mat = {};
            for (let d = 0; d < 7; d++) mat[d] = Array(48).fill(0);
            init[newId] = { id: newId, name: "Default Schedule", matrix: mat, enabled: true };
        }

        setLocalSchedules(init);
        setSelectedId(Object.keys(init)[0]);
    }, [schedules]);

    const currentSchedule = localSchedules[selectedId];

    const handleCreate = () => {
        const newId = "sch_" + Date.now();
        const mat = {};
        for (let d = 0; d < 7; d++) mat[d] = Array(48).fill(0);
        const newSch = { id: newId, name: "New Schedule", matrix: mat, enabled: true };
        setLocalSchedules({ ...localSchedules, [newId]: newSch });
        setSelectedId(newId);
    };

    const handleDelete = () => {
        if (!window.confirm("Delete schedule?")) return;
        const newS = { ...localSchedules };
        delete newS[selectedId];
        // If empty, create one? Or allow empty.
        setLocalSchedules(newS);
        setSelectedId(Object.keys(newS)[0] || null);
    };

    const handleSaveAll = () => {
        // Convert map back to array
        const arr = Object.values(localSchedules);
        onSave(arr);
    };

    const toggleSlot = (dayIndex, slotIndex) => {
        if (!currentSchedule) return;
        const d = dayIndex.toString();
        const currentArr = [...(currentSchedule.matrix[d] || Array(48).fill(0))];

        currentArr[slotIndex] = currentArr[slotIndex] ? 0 : 1;

        setLocalSchedules({
            ...localSchedules,
            [selectedId]: {
                ...currentSchedule,
                matrix: { ...currentSchedule.matrix, [d]: currentArr }
            }
        });
    };

    const handleNameChange = (e) => {
        setLocalSchedules({
            ...localSchedules,
            [selectedId]: { ...currentSchedule, name: e.target.value }
        });
    };

    // Quick Fill Actions (Full Day)
    const fillDay = (dayIndex, val) => {
        if (!currentSchedule) return;
        const d = dayIndex.toString();
        const arr = Array(48).fill(val ? 1 : 0);
        setLocalSchedules(prev => ({
            ...prev,
            [selectedId]: {
                ...prev[selectedId],
                matrix: { ...prev[selectedId].matrix, [d]: arr }
            }
        }));
    };

    if (!currentSchedule && Object.keys(localSchedules).length > 0) {
        setSelectedId(Object.keys(localSchedules)[0]);
        return null;
    }

    return (
        <div style={{ padding: 20, color: "#ccc", height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <h2>Schedule Editor (30 min intervals)</h2>
                <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={handleDelete} style={{ background: "#d32f2f", color: "white", border: "none", padding: "5px 15px", cursor: "pointer" }}>Delete</button>
                    <button onClick={handleSaveAll} style={{ background: "#007acc", color: "white", border: "none", padding: "5px 20px", fontWeight: "bold", cursor: "pointer" }}>SAVE ALL Schedules</button>
                </div>
            </div>

            <div style={{ display: "flex", gap: 20, flex: 1, overflow: "hidden" }}>
                {/* LIST */}
                <div style={{ width: 200, background: "#252526", border: "1px solid #444", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: 10, borderBottom: "1px solid #444", fontWeight: "bold", background: "#333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        Schedules
                        <button onClick={handleCreate} style={{ fontSize: 16, cursor: "pointer", background: "none", border: "none", color: "#4caf50" }}>+</button>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {Object.values(localSchedules).map((s) => (
                            <div
                                key={s.id}
                                onClick={() => setSelectedId(s.id)}
                                style={{ padding: 10, cursor: "pointer", background: s.id === selectedId ? "#007acc" : "transparent", borderBottom: "1px solid #333" }}
                            >
                                {s.name}
                            </div>
                        ))}
                    </div>
                </div>

                {/* EDITOR */}
                {currentSchedule && (
                    <div style={{ flex: 1, background: "#252526", border: "1px solid #444", padding: 20, overflowY: "auto" }}>
                        <div style={{ marginBottom: 20 }}>
                            <label>Schedule Name: </label>
                            <input value={currentSchedule.name} onChange={handleNameChange} style={{ background: "#111", border: "1px solid #444", color: "#fff", padding: 5, width: 300, marginLeft: 10 }} />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
                            {/* Header */}
                            <div></div>
                            <div style={{ display: "flex" }}>
                                {Array.from({ length: 24 }, (_, i) => (
                                    <div key={i} style={{ flex: 1, fontSize: 10, textAlign: "center", color: "#888", borderLeft: i > 0 ? "1px solid #333" : "none" }}>{i}</div>
                                ))}
                            </div>

                            {DAYS.map((day, dIdx) => (
                                <React.Fragment key={day}>
                                    <div style={{ textAlign: "right", paddingRight: 10, fontSize: 13, paddingTop: 5 }}>
                                        <div style={{ fontWeight: "bold" }}>{day}</div>
                                        <div style={{ fontSize: 9, color: "#007acc", cursor: "pointer", textDecoration: "underline" }} onClick={() => fillDay(dIdx, true)}>All</div>
                                        <div style={{ fontSize: 9, color: "#f44336", cursor: "pointer", textDecoration: "underline" }} onClick={() => fillDay(dIdx, false)}>None</div>
                                    </div>
                                    <div style={{ display: "flex", border: "1px solid #444", background: "#111", height: 30 }}>
                                        {Array.from({ length: 24 }, (_, h) => {
                                            // 2 slots per hour
                                            const s1 = currentSchedule.matrix[dIdx]?.[h * 2];
                                            const s2 = currentSchedule.matrix[dIdx]?.[h * 2 + 1];

                                            // Handle mouse events for drag capability (simplified)
                                            return (
                                                <div key={h} style={{ flex: 1, display: "flex", borderRight: "1px solid #333" }}>
                                                    <div
                                                        style={{ flex: 1, background: s1 ? "#4caf50" : "transparent", borderRight: "1px dotted #222", cursor: "pointer" }}
                                                        onMouseDown={(e) => e.buttons === 1 && toggleSlot(dIdx, h * 2)}
                                                        onMouseEnter={(e) => e.buttons === 1 && toggleSlot(dIdx, h * 2)}
                                                        title={`${day} ${h}:00 - ${h}:30`}
                                                    />
                                                    <div
                                                        style={{ flex: 1, background: s2 ? "#4caf50" : "transparent", cursor: "pointer" }}
                                                        onMouseDown={(e) => e.buttons === 1 && toggleSlot(dIdx, h * 2 + 1)}
                                                        onMouseEnter={(e) => e.buttons === 1 && toggleSlot(dIdx, h * 2 + 1)}
                                                        title={`${day} ${h}:30 - ${h + 1}:00`}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScheduleEditor;
