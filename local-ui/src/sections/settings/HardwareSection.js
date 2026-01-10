import React, { useState, useEffect, useMemo, useRef } from "react";
import { API } from "../../api";
import { colors } from "../../theme";
import { Trash, Edit, SettingsIcon, Lock, AlertTriangle, Save, Camera, Video, Archive, ChevronRight, RefreshCw } from "../../components/Icons";
import Go2RTCPlayer from "../../components/Go2RTCPlayer"; // Import optimized player
import RecorderPlayer from "../../components/RecorderPlayer"; // Still used for Channel Setup Large View

const videoStyle = { width: "100%", height: "100%" };

// Sub-component for auto-refreshing preview (Snapshot Mode for Performance)
export function LivePreview({ camId, active = true }) {
    if (!active) return <div style={{ width: "100%", height: "100%", background: "#000" }} />;
    return (
        <div style={{ width: "100%", height: "100%", background: "#000", overflow: "hidden" }}>
            <Go2RTCPlayer camId={camId} streamType="sub" />
        </div>
    );
}

// --- REWRITTEN ROI COMPONENT ---
// Uses normalized coordinates (0-1) for storage, mapped to dynamic pixel size for display.
export function CanvasROI({ points = [], onChange, readOnly = false, otherZones = [] }) {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const [dims, setDims] = useState({ w: 0, h: 0 }); // Container dimensions
    const [draggingIdx, setDraggingIdx] = useState(-1);

    // 1. Measure Container Size
    useEffect(() => {
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDims({ w: Math.round(width), h: Math.round(height) });
            }
        });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    // 2. Draw Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || dims.w === 0 || dims.h === 0) return;
        const ctx = canvas.getContext("2d");

        // Clear (using the set Dims)
        ctx.clearRect(0, 0, dims.w, dims.h);

        // Drawing Helper
        const drawZone = (pts, stroke, fill) => {
            if (!pts || pts.length === 0) return;
            ctx.beginPath();
            // Move to first
            ctx.moveTo(pts[0][0] * dims.w, pts[0][1] * dims.h);
            // Lines to rest
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i][0] * dims.w, pts[i][1] * dims.h);
            }
            ctx.closePath();
            ctx.strokeStyle = stroke;
            ctx.fillStyle = fill;
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();

            // Handles (only for active, editable)
            if (!readOnly && stroke === "#00ff00") {
                ctx.fillStyle = "#fff";
                pts.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p[0] * dims.w, p[1] * dims.h, 4, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        };

        // Draw Inactive Zones
        otherZones.forEach(z => {
            if (z.points) drawZone(z.points, "rgba(0,122,204,0.5)", "rgba(0,122,204,0.2)");
        });

        // Draw Active Zone
        // Ensure points are normalized (0-1). If > 1, convert on fly to support legacy.
        const safePoints = points.map(p => [
            p[0] > 1 ? p[0] / dims.w : p[0],
            p[1] > 1 ? p[1] / dims.h : p[1]
        ]);

        drawZone(safePoints, readOnly ? "#ff9800" : "#00ff00", readOnly ? "rgba(255,152,0,0.25)" : "rgba(0,255,0,0.15)");

    }, [points, dims, readOnly, otherZones]);

    // 3. Interactions
    const handleMouseDown = (e) => {
        if (readOnly) return;

        // Use native Offset - much faster and accurate relative to element
        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;

        // Normalize
        const nx = Math.max(0, Math.min(1, x / dims.w));
        const ny = Math.max(0, Math.min(1, y / dims.h));

        // Check hit (distance in pixels)
        // Convert existing points to pixels for check
        const hitIdx = points.findIndex(p => {
            const px = p[0] > 1 ? p[0] : p[0] * dims.w;
            const py = p[1] > 1 ? p[1] : p[1] * dims.h;
            return Math.sqrt((px - x) ** 2 + (py - y) ** 2) < 10;
        });

        if (hitIdx !== -1) {
            setDraggingIdx(hitIdx);
        } else {
            // Add new point (Normalized)
            onChange([...points, [nx, ny]]);
        }
    };

    const handleMouseMove = (e) => {
        if (draggingIdx === -1 || readOnly) return;

        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;

        const nx = Math.max(0, Math.min(1, x / dims.w));
        const ny = Math.max(0, Math.min(1, y / dims.h));

        const newPoints = [...points];
        newPoints[draggingIdx] = [nx, ny];
        onChange(newPoints);
    };

    const handleMouseUp = () => setDraggingIdx(-1);

    return (
        <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10 }}>
            <canvas
                ref={canvasRef}
                width={dims.w} // Lock resolution to physical pixels
                height={dims.h}
                style={{ width: "100%", height: "100%", display: "block", cursor: readOnly ? "default" : "crosshair" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />
        </div>
    );
}

const styles = {
    inputTable: { background: "#444", border: "1px solid #555", color: "#fff", width: "100%", padding: 2 },
    btnPrimary: { marginRight: 10, padding: "6px 20px", background: "#007acc", color: "white", border: "none", borderRadius: 2, fontSize: 13, cursor: "pointer", fontWeight: "bold" },
    btnToolbar: { marginRight: 10, padding: "6px 15px", background: "#333", color: "#ddd", border: "1px solid #444", borderRadius: 2, fontSize: 12, cursor: "pointer" },
};

export function IPDevicesRootSection({ cams, statusData = {}, onEditCam, onSelectCam, onDeleteCam }) {
    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Gestionare Dispozitive IP</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                {cams.map(c => (
                    <div key={c.id} style={{ background: "#252526", border: "1px solid #444", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: 150, background: "#000", position: "relative" }}>
                            <Go2RTCPlayer camId={c.id} streamType="sub" style={{ width: "100%", height: "100%", objectFit: "fill" }} />
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 14 }}>
                                {c.name || c.ip}
                            </div>
                        </div>
                        <div style={{ padding: 15 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <div style={{ fontSize: 13, fontWeight: "bold", color: "#fff" }}>{c.ip}</div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                    {(statusData[c.id]?.connected || statusData[c.id]?.status === "ONLINE") ?
                                        <div style={{ fontSize: 11, color: "#4caf50", background: "rgba(76,175,80,0.1)", padding: "2px 6px", borderRadius: 4 }}>Active ({statusData[c.id]?.fps || 0} FPS)</div> :
                                        <div style={{ fontSize: 11, color: "#f44336", background: "rgba(244,67,54,0.1)", padding: "2px 6px", borderRadius: 4 }}>Offline</div>
                                    }
                                    <div style={{ fontSize: 9, color: "#888", marginTop: 3 }}>
                                        Check: {new Date().toLocaleTimeString()}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>Model: {c.model || "Generic"} | {c.manufacturer}</div>
                            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                                <button style={{ ...styles.btnToolbar, flex: 1 }} onClick={() => onEditCam(c)}><Edit size={12} /> Edit</button>
                                <button style={{ ...styles.btnToolbar, flex: 1 }} onClick={() => onSelectCam(c.id)}><SettingsIcon size={12} /> Config</button>
                            </div>
                            <button
                                style={{
                                    width: "100%", padding: "6px 0", background: "rgba(244, 67, 54, 0.1)",
                                    border: "1px solid #d32f2f", color: "#e57373", borderRadius: 2,
                                    fontSize: 12, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 5
                                }}
                                onClick={() => onDeleteCam(c.id)}
                            >
                                <Trash size={12} /> Delete Device
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CameraSettingsSection({
    cam, statusData, updateCam, saveAll, deleteCam, openEditModal, setSelection
}) {
    const [syncing, setSyncing] = useState(false);
    const [caps, setCaps] = useState(null); // Store dynamic device capabilities

    const fetchDeviceConfig = async () => {
        if (!cam || !cam.id) return;
        try {
            const res = await API.get(`/device-config/${cam.id}`);
            const { current, capabilities } = res.data;
            if (current) {
                // Update local storage state with real device values
                if (current.codec) updateCam(cam.id, "codec", current.codec);
                if (current.fps) updateCam(cam.id, "fps", current.fps);
                if (current.gop) updateCam(cam.id, "gop", current.gop);
                if (current.resolution) updateCam(cam.id, "resolution", current.resolution);
            }
            if (capabilities) {
                setCaps(capabilities);
            }
        } catch (e) {
            console.warn(`[CamSync] Polling failed for ${cam.ip}:`, e.message);
        }
    };

    // Initial load and periodic polling (every 10s)
    useEffect(() => {
        fetchDeviceConfig();
        const timer = setInterval(fetchDeviceConfig, 10000);
        return () => clearInterval(timer);
    }, [cam?.id]);

    const handleRemoteChange = async (key, val) => {
        // 1. Optimistic Update (UI)
        updateCam(cam.id, key, val);

        // 2. Send to Device
        setSyncing(true);
        try {
            console.log(`[CamSync] Updating ${key} to ${val} for ${cam.ip}...`);
            await API.post(`/device-config/${cam.id}`, { [key]: val });

            // Backend now handles saving to cameras.json, so we don't need saveAll() here.
            // This avoids race conditions with stale frontend state.

            // Confirm with a fresh fetch
            setTimeout(fetchDeviceConfig, 1500);
        } catch (e) {
            console.error(`[CamSync] Update failed:`, e);
            alert(`Failed to update camera: ${e.response?.data?.error || e.message}`);
            // Revert or sync back on error
            fetchDeviceConfig();
        } finally {
            setSyncing(false);
        }
    };

    if (!cam) return <div>Camera not found</div>;
    return (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, marginBottom: 15, color: "#fff" }}>Camera {cam.ip}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10, maxWidth: 600, marginBottom: 15 }}>
                    <label>Model:</label> <div style={{ fontWeight: "bold" }}>{cam.model || "Autodetect"}</div>
                    <label>Device Name:</label>
                    <input style={{ background: "#333", border: "1px solid #555", color: "#ddd", padding: 4 }}
                        value={cam.name || `Camera ${cam.ip}`}
                        onChange={e => updateCam(cam.id, "name", e.target.value)}
                        onBlur={() => saveAll()}
                    />
                </div>
                <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 15 }}>
                    <span>IP Address: <b style={{ color: "#fff" }}>{cam.ip}</b></span>
                    <span>Port: <b style={{ color: "#fff" }}>{cam.port}</b></span>
                    <span>User: <b style={{ color: "#fff" }}>{cam.user}</b></span>
                    <button onClick={() => openEditModal(cam)} style={{ color: "rgb(66, 165, 245)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Setup connection</button>
                </div>
                {cam.storagePath && (
                    <div style={{ marginBottom: 20, fontSize: 13, color: "#ccc", display: "flex", alignItems: "center", gap: 5 }}>
                        Storage Path:
                        <span
                            title="Click to view recordings"
                            onClick={() => window.location.href = `/playback?camId=${cam.id}`}
                            style={{ fontFamily: "monospace", color: "#81d4fa", cursor: "pointer", textDecoration: "underline", background: "rgba(33, 150, 243, 0.1)", padding: "2px 6px", borderRadius: 4 }}
                        >
                            {cam.storagePath} [->]
                        </span>
                    </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, auto)", gap: 10, marginBottom: 20, alignItems: "center", justifyContent: "start" }}>
                    <button style={{ ...styles.btnToolbar, width: 120, background: (cam.enabled !== false) ? "#333" : "#4caf50", color: (cam.enabled !== false) ? "#ddd" : "#fff" }} onClick={() => { const next = (cam.enabled !== false) ? false : true; updateCam(cam.id, "enabled", !!next); saveAll(); }}>{(cam.enabled !== false) ? "Disable" : "Enable"}</button>
                    <button style={{ ...styles.btnToolbar, width: 120 }} onClick={() => deleteCam(cam.id)}><Trash size={12} style={{ marginRight: 5 }} /> Delete...</button>
                    <button
                        style={{ ...styles.btnToolbar, background: "rgba(0,122,204,0.1)", border: "1px solid #007acc", color: "#81d4fa", width: 160 }}
                        onClick={() => setSelection({ type: "CHANNEL", id: cam.id })}
                    >
                        <SettingsIcon size={12} style={{ marginRight: 5 }} /> AI / Channel Setup
                    </button>
                    <a href={`http://${cam.ip}`} target="_blank" rel="noreferrer" style={{ color: "rgb(66, 165, 245)", textDecoration: "none", alignSelf: "center", margin: "0 10px" }}>Web Interface</a>
                </div>

                <div style={{ marginBottom: 30, display: "flex", alignItems: "center", gap: 20 }}>
                    {(statusData[cam.id]?.connected || statusData[cam.id]?.status === "ONLINE") ?
                        <div>State: <span style={{ color: "rgb(76, 175, 80)", fontWeight: "bold" }}>Connected</span></div> :
                        <div>State: <span style={{ color: "#f44336", fontWeight: "bold" }}>Disconnected production</span> <span style={{ fontSize: 11, color: "#ffa726", marginLeft: 10 }}>{statusData[cam.id]?.lastError ? <><AlertTriangle size={10} /> {statusData[cam.id].lastError}</> : "(Retry in 5s...)"}</span></div>
                    }

                    <button
                        onClick={fetchDeviceConfig}
                        style={{
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid #444",
                            color: "#fff",
                            padding: "4px 10px",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 5
                        }}
                        disabled={syncing}
                    >
                        {syncing ? "Syncing..." : "🔄 Refresh State"}
                    </button>
                    <span style={{ color: "#666", fontSize: 11 }}>Auto-sync active (10s)</span>
                </div>

                <div style={{ display: "flex", gap: 20 }}>
                    <div style={{ width: 160, height: 90, background: "#000", border: "1px solid #444", position: "relative" }}>
                        <LivePreview camId={cam.id} active={true} />
                    </div>
                    <div style={{ flex: 1, position: "relative" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 80px 80px", gap: 10, fontSize: 12, fontWeight: "bold", marginBottom: 5, color: "#aaa" }}>
                            <div></div><div>Codec</div><div>Resolution</div><div>GOP</div><div>FPS</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 80px 80px", gap: 10, marginBottom: 10, alignItems: "center" }}>
                            <div style={{ color: cam.codec === "H.265" ? "#ffa726" : "#4caf50" }}>
                                <input type="checkbox" checked readOnly style={{ marginRight: 5 }} /> Video
                                {cam.codec === "H.265" && <span title="WebRTC doesn't support H.265 natively"> ⚠️</span>}
                            </div>

                            <select style={styles.inputTable} value={cam.codec || "H.264"} onChange={e => handleRemoteChange("codec", e.target.value)}>
                                {caps?.codecs?.map(c => <option key={c} value={c}>{c}</option>) || <option>H.264</option>}
                            </select>

                            <select style={styles.inputTable} value={cam.resolution} onChange={e => handleRemoteChange("resolution", e.target.value)}>
                                {caps?.resolutions?.map(r => (
                                    <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                                        {r.label}
                                    </option>
                                )) || <option>{cam.resolution}</option>}
                            </select>

                            <input style={styles.inputTable}
                                type="number"
                                value={cam.gop || 20}
                                min={caps?.gopRange?.min || 1}
                                max={caps?.gopRange?.max || 400}
                                onChange={e => updateCam(cam.id, "gop", e.target.value)}
                                onBlur={e => handleRemoteChange("gop", e.target.value)}
                            />

                            <select style={styles.inputTable} value={cam.fps || 25} onChange={e => handleRemoteChange("fps", e.target.value)}>
                                {caps?.fps?.map(f => <option key={f} value={f}>{f} fps</option>) || <option>{cam.fps} fps</option>}
                            </select>
                        </div>
                        {cam.codec === "H.265" && (
                            <div style={{ color: "#ffa726", fontSize: 11, marginTop: 5 }}>
                                <AlertTriangle size={10} /> Camera is in H.265 mode. Switch to H.264 for better grid performance and browser compatibility.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ChannelSettingsSection({
    cam, cams, setCams, setSelection, availableModules, updateCam, saveAll
}) {
    const [activeZoneIdx, setActiveZoneIdx] = useState(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [roiPoints, setRoiPoints] = useState([]);

    const camAI = cam.ai_server || {};
    let zones = camAI.zones || [];
    if (zones.length === 0 && camAI.roi && camAI.roi.length > 0) {
        zones = [{ name: "Default Zone", points: camAI.roi, objects: camAI.objects || {} }];
    }

    const safeIdx = (activeZoneIdx >= zones.length) ? 0 : activeZoneIdx;
    const activeZone = zones[safeIdx] || null;
    const pointsToShow = isDrawing ? roiPoints : (activeZone?.points || []);

    const silentSave = async (updatedCams) => {
        try {
            await API.post("/cameras/config", updatedCams);
        } catch (e) {
            console.error("Silent save failed", e);
            alert("Error saving settings: " + e.message);
        }
    };

    const handleSaveZonePoints = () => {
        setIsDrawing(false);
        const newZones = [...zones];
        if (!newZones[safeIdx]) return;
        newZones[safeIdx] = { ...newZones[safeIdx], points: roiPoints };
        const newConf = { ...camAI, zones: newZones, enabled: true };
        const updatedCams = cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c);
        setCams(updatedCams);
        silentSave(updatedCams);
    };

    const handleAddZone = () => {
        const newName = `Zone ${zones.length + 1}`;
        const newZones = [...zones, { name: newName, points: [], objects: {} }];
        const newConf = { ...camAI, zones: newZones };
        const updatedCams = cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c);
        setCams(updatedCams);
        setActiveZoneIdx(newZones.length - 1);
        silentSave(updatedCams);
    };

    const handleDeleteZone = () => {
        if (!activeZone) return;
        if (!window.confirm(`Delete ${activeZone.name}?`)) return;
        const newZones = zones.filter((_, i) => i !== safeIdx);
        const newConf = { ...camAI, zones: newZones };
        const updatedCams = cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c);
        setCams(updatedCams);
        setActiveZoneIdx(0);
        silentSave(updatedCams);
    };

    const handleObjectToggle = (objKey) => {
        if (!activeZone) return;
        const newObjs = { ...(activeZone.objects || {}), [objKey]: !activeZone.objects?.[objKey] };
        const newZones = [...zones];
        newZones[safeIdx] = { ...newZones[safeIdx], objects: newObjs };
        const newConf = { ...camAI, zones: newZones };
        const updatedCams = cams.map(c => c.id === cam.id ? { ...c, ai_server: newConf } : c);
        setCams(updatedCams);
        silentSave(updatedCams);
    };

    return (
        <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 15 }}>
                <h2 style={{ fontSize: 18, margin: 0, color: "#fff" }}>AI Zones: {cam.name || cam.ip}</h2>
                <button onClick={() => setSelection({ type: "CAMERA", id: cam.id })} style={{ color: "rgb(66, 165, 245)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>[Back] Back to Hardware Settings</button>
            </div>

            <div style={{ display: "flex", gap: 20, height: 500 }}>
                <div style={{ flex: 3, display: "flex", flexDirection: "column" }}>
                    {/* FIXED ASPECT RATIO 16:9 to match Camera Stream and ensure Canvas overlay aligns perfectly */}
                    <div style={{ width: "100%", aspectRatio: "16/9", border: "2px solid #444", borderRadius: 4, overflow: "hidden", background: "#000", position: "relative" }}>
                        <Go2RTCPlayer camId={cam.id} style={videoStyle} streamType="hd" />
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
                            {activeZone ? (
                                <CanvasROI
                                    points={pointsToShow}
                                    onChange={isDrawing ? setRoiPoints : undefined}
                                    readOnly={!isDrawing}
                                    width={800} height={450}
                                    otherZones={zones.filter((_, i) => i !== safeIdx)}
                                />
                            ) : (
                                <div style={{ color: "#fff", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>Select or Add a Zone</div>
                            )}
                        </div>
                    </div>

                    {activeZone && (
                        <div style={{ marginTop: 10, display: "flex", gap: 10, padding: 8, background: "#252526", borderRadius: 4, border: "1px solid #333", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#aaa", fontWeight: "bold", marginRight: 10 }}>Zone Actions:</span>
                            {isDrawing ? (
                                <>
                                    <button style={{ ...styles.btnPrimary, background: "#4caf50" }} onClick={handleSaveZonePoints}>[SAVE] Save Area</button>
                                    <button style={styles.btnToolbar} onClick={() => { setIsDrawing(false); setRoiPoints([]); }}>Cancel</button>
                                </>
                            ) : (
                                <button style={{ ...styles.btnPrimary, background: "#2196f3" }} onClick={() => { setRoiPoints(activeZone.points || []); setIsDrawing(true); }}>[EDIT] Edit Area</button>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ flex: 1, background: "#1e1e1e", border: "1px solid #444", padding: 15, display: "flex", flexDirection: "column" }}>
                    <div style={{ marginBottom: 20, flex: 1, overflowY: "auto" }}>
                        <div style={{ borderBottom: "1px solid #444", marginBottom: 15, paddingBottom: 15 }}>
                            <h4 style={{ margin: "0 0 10px 0", color: colors.accent, fontSize: 13 }}>AI Configuration</h4>
                            <div style={{ marginBottom: 15 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                                    <label style={{ fontSize: 12, color: "#aaa" }}>Sensitivity: {(cam.ai_server?.sensitivity * 100 || 50).toFixed(0)}%</label>
                                </div>
                                <input
                                    type="range" min="0" max="1" step="0.05"
                                    value={cam.ai_server?.sensitivity || 0.5}
                                    onChange={e => {
                                        const next = { ...cam.ai_server, sensitivity: parseFloat(e.target.value) };
                                        const updated = cams.map(c => c.id === cam.id ? { ...c, ai_server: next } : c);
                                        setCams(updated); silentSave(updated);
                                    }}
                                    style={{ width: "100%", cursor: "pointer" }}
                                />
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666", marginTop: 4 }}>
                                    <span>0% (Filtrare Maximă)</span>
                                    <span>100% (Alertă Maximă)</span>
                                </div>
                                <p style={{ fontSize: 11, color: "#888", marginTop: 8, lineHeight: "1.4" }}>
                                    <b>0%:</b> Doar obiecte foarte clare. Reduce alarmele false (umbre, insecte).<br />
                                    <b>100%:</b> Detectează orice mișcare suspectă. Risc ridicat de alarme false.
                                </p>
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <h4 style={{ margin: 0, color: "#ddd" }}>Detection Zones</h4>
                            <button style={{ background: "#4caf50", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer", padding: "2px 8px", fontSize: 16 }} onClick={handleAddZone}>+</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {zones.map((z, idx) => (
                                <div key={idx} onClick={() => { setActiveZoneIdx(idx); setIsDrawing(false); }}
                                    style={{ padding: "8px 10px", background: idx === safeIdx ? "#2196f3" : "#333", color: "#fff", borderRadius: 3, cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                                    <span>{z.name}</span>
                                    {idx === safeIdx && <button onClick={(e) => { e.stopPropagation(); handleDeleteZone(); }} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}>×</button>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {activeZone && (
                        <div style={{ borderTop: "1px solid #444", paddingTop: 15 }}>
                            <h4 style={{ marginTop: 0, color: "#ddd", fontSize: 13 }}>Search Objects ({activeZone.name})</h4>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                                {(() => {
                                    const currentModName = cam.ai_server?.module || "ai_small";
                                    const modulesList = Array.isArray(availableModules) ? availableModules : [];
                                    const currentMod = modulesList.find(m => m.name === currentModName);
                                    const displayClasses = currentMod?.classes?.length > 0 ? currentMod.classes : ["person", "car", "truck"];
                                    return displayClasses.map(obj => (
                                        <label key={obj} style={{ display: "flex", alignItems: "center", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                                            <input type="checkbox" checked={activeZone.objects?.[obj] || false} onChange={() => handleObjectToggle(obj)} style={{ marginRight: 8 }} />
                                            {obj}
                                        </label>
                                    ));
                                })()}
                            </div>
                        </div>
                    )}

                    <div style={{ borderTop: "1px solid #444", marginTop: 15, paddingTop: 15 }}>
                        <h4 style={{ margin: "0 0 10px 0", color: "#ddd", fontSize: 13 }}>Recording Setup</h4>
                        <label style={{ display: "flex", alignItems: "center", marginBottom: 10, cursor: "pointer", color: "#ccc", fontSize: 13 }}>
                            <input type="checkbox" checked={cam.record !== false} onChange={e => {
                                const updatedCams = cams.map(c => c.id === cam.id ? { ...c, record: e.target.checked } : c);
                                setCams(updatedCams); silentSave(updatedCams);
                            }} style={{ marginRight: 8 }} />
                            Enable Recording
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
