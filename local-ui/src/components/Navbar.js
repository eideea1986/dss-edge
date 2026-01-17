import { Link } from "react-router-dom";
import { colors } from "../theme";
import SystemStatus from "./SystemStatus";

export default function Navbar() {
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem("edge_user"));
    } catch (e) { }

    const handleLogout = () => {
        if (window.confirm("Sigur doriți să vă delogați?")) {
            localStorage.removeItem("edge_user");
            window.location.reload();
        }
    };

    return (
        <div style={{
            background: colors.card,
            padding: "10px 20px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
        }}>
            <div style={{ fontSize: 20, color: colors.accent, fontWeight: "bold" }}>
                DSS SmartGuard Edge <span style={{ fontSize: 10, color: colors.primary, marginLeft: 10 }}>v5.1.0 (Industrial Mode - Trassir Standard)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
                <Link to="/live" style={{ marginRight: 20, color: colors.text, textDecoration: "none", fontWeight: "bold" }}>Live</Link>
                <Link to="/playback" style={{ marginRight: 20, color: colors.text, textDecoration: "none", fontWeight: "bold" }}>Arhivă</Link>
                <Link to="/settings" style={{ marginRight: 20, color: colors.text, textDecoration: "none" }}>Setări</Link>

                <SystemStatus />


                {/* Username Display (Click to Logout) */}
                <div
                    onClick={handleLogout}
                    title="Click to logout"
                    style={{
                        background: "rgba(33, 150, 243, 0.1)", // Subtle background
                        border: `1px solid ${colors.primary}`,
                        color: colors.primary,
                        padding: "6px 16px",
                        borderRadius: 20, // Pill shape
                        cursor: "pointer",
                        fontWeight: "bold",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        transition: "all 0.2s"
                    }}
                >
                    <span style={{ marginRight: 8, fontSize: 16 }}>👤</span>
                    {user?.username || "Guest"}
                </div>
            </div>
        </div>
    );
}
