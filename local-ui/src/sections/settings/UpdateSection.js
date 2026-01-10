import React, { useState } from "react";
import { API } from "../../api";
import { colors, styles } from "../../theme";
import { Upload, Check, AlertTriangle, RefreshCw } from "../Icons";

export default function UpdateSection() {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState("");
    const [progress, setProgress] = useState(0);
    const [currentVersion, setCurrentVersion] = useState("Loading...");

    React.useEffect(() => {
        API.get("/status").then(res => {
            setCurrentVersion(res.data.version || "Unknown");
        }).catch(() => setCurrentVersion("Unknown"));
    }, []);

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && selectedFile.name.endsWith('.zip')) {
            setFile(selectedFile);
            setStatus("");
        } else {
            setStatus("Error: Only .zip files allowed");
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setStatus("Uploading update package...");
        setProgress(10);

        const formData = new FormData();
        formData.append('update', file);

        try {
            const res = await API.post("/system/update", formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    const percent = Math.round((e.loaded * 100) / e.total);
                    setProgress(percent);
                }
            });

            setStatus("Update successful! " + (res.data.message || ""));
            setProgress(100);

            // Refresh after 3 seconds
            setTimeout(() => {
                setStatus("Reloading interface...");
                window.location.reload();
            }, 3000);
        } catch (e) {
            setStatus("Error: " + (e.response?.data?.error || e.message));
            setProgress(0);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ padding: 20, maxWidth: 800 }}>
            <h3 style={{ color: colors.accent, marginBottom: 20 }}>System Update</h3>

            <div style={{ background: "#222", padding: 20, borderRadius: 8, marginBottom: 20 }}>
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "#aaa", fontSize: 13 }}>
                        Current Version
                    </label>
                    <div style={{ fontSize: 18, fontWeight: "bold", color: colors.accent }}>
                        {currentVersion}
                    </div>
                </div>

                <div style={{ borderTop: "1px solid #333", paddingTop: 15, marginTop: 15 }}>
                    <label style={{ display: "block", marginBottom: 10, color: "#aaa", fontSize: 13 }}>
                        Upload Update Package (.zip)
                    </label>

                    <input
                        type="file"
                        accept=".zip"
                        onChange={handleFileSelect}
                        style={{
                            padding: 10,
                            background: "#333",
                            border: "1px solid #444",
                            borderRadius: 4,
                            color: "#fff",
                            width: "100%",
                            marginBottom: 15
                        }}
                    />

                    {file && (
                        <div style={{ marginBottom: 15, padding: 10, background: "#1a1a1a", borderRadius: 4 }}>
                            <div style={{ fontSize: 12, color: "#aaa" }}>Selected File:</div>
                            <div style={{ fontSize: 14, color: "#fff", marginTop: 5 }}>{file.name}</div>
                            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        style={{
                            ...styles.btnPrimary,
                            width: "100%",
                            padding: 12,
                            fontSize: 14,
                            fontWeight: "bold",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            opacity: (!file || uploading) ? 0.5 : 1,
                            cursor: (!file || uploading) ? "not-allowed" : "pointer"
                        }}
                    >
                        {uploading ? (
                            <>
                                <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
                                Uploading {progress}%
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Upload & Install Update
                            </>
                        )}
                    </button>
                </div>

                {uploading && progress > 0 && (
                    <div style={{ marginTop: 15 }}>
                        <div style={{
                            width: "100%",
                            height: 8,
                            background: "#333",
                            borderRadius: 4,
                            overflow: "hidden"
                        }}>
                            <div style={{
                                width: `${progress}%`,
                                height: "100%",
                                background: colors.accent,
                                transition: "width 0.3s"
                            }} />
                        </div>
                    </div>
                )}

                {status && (
                    <div style={{
                        marginTop: 15,
                        padding: 12,
                        background: status.includes("Error") ? "#4a1515" : "#154a15",
                        border: `1px solid ${status.includes("Error") ? "#f44336" : "#4caf50"}`,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        gap: 10
                    }}>
                        {status.includes("Error") ? (
                            <AlertTriangle size={18} color="#f44336" />
                        ) : (
                            <Check size={18} color="#4caf50" />
                        )}
                        <span style={{ fontSize: 13, color: "#fff" }}>{status}</span>
                    </div>
                )}
            </div>

            <div style={{ background: "#1a1a1a", padding: 15, borderRadius: 8, fontSize: 12, color: "#888" }}>
                <strong style={{ color: "#aaa" }}>Important:</strong>
                <ul style={{ marginTop: 10, paddingLeft: 20 }}>
                    <li>Ensure the update package is from a trusted source</li>
                    <li>Do not refresh the browser during update</li>
                    <li>The system will restart automatically after update</li>
                    <li>Current sessions will be preserved</li>
                </ul>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
