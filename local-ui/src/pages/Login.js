import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API } from "../api";
import { colors } from "../theme";

export default function Login() {
    const [creds, setCreds] = useState({ username: "", password: "" });
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || "/settings";

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await API.post("/auth/login", creds);
            if (res.data.success) {
                // Store minimal session info
                localStorage.setItem("edge_user", JSON.stringify(res.data.user));
                navigate(from, { replace: true });
            }
        } catch (err) {
            setError("Date incorecte");
        }
    };

    return (
        <div style={{
            height: "100vh", display: "flex", justifyContent: "center", alignItems: "center",
            background: colors.bg, color: colors.text, fontFamily: "Segoe UI, sans-serif"
        }}>
            <form onSubmit={handleLogin} style={{
                background: colors.panel, padding: 40, borderRadius: 8, border: `1px solid ${colors.border}`,
                width: 300, display: "flex", flexDirection: "column", gap: 15
            }}>
                <h2 style={{ textAlign: "center", marginBottom: 20 }}>Autentificare</h2>

                {error && <div style={{ color: "#f44336", textAlign: "center", fontSize: 13 }}>{error}</div>}

                <div>
                    <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#aaa" }}>Utilizator</label>
                    <input
                        autoFocus
                        value={creds.username}
                        onChange={e => setCreds({ ...creds, username: e.target.value })}
                        style={{ width: "100%", padding: 10, background: "#222", border: "1px solid #444", color: "#fff", borderRadius: 4 }}
                    />
                </div>

                <div>
                    <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#aaa" }}>Parolă</label>
                    <input
                        type="password"
                        value={creds.password}
                        onChange={e => setCreds({ ...creds, password: e.target.value })}
                        style={{ width: "100%", padding: 10, background: "#222", border: "1px solid #444", color: "#fff", borderRadius: 4 }}
                    />
                </div>

                <button type="submit" style={{
                    marginTop: 10, padding: 12, background: colors.primary, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold"
                }}>
                    LOGIN
                </button>
            </form>
        </div>
    );
}
