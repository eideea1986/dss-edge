export const colors = {
    bg: "#1e1e1e",
    panel: "#252526",
    accent: "#007acc",
    text: "#cccccc",
    border: "#3e3e42",
    success: "#4caf50",
    danger: "#f44336",
    warning: "#ff9800",
    info: "#2196f3"
};

export const styles = {
    container: { height: "100%", display: "flex", flexDirection: "column", background: colors.bg, color: colors.text, fontFamily: "Segoe UI, sans-serif" },
    main: { flex: 1, display: "flex", overflow: "hidden" },
    sidebar: { width: 250, background: colors.panel, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", overflowY: "auto", height: "100%" },
    content: { flex: 1, display: "flex", flexDirection: "column", padding: 0, overflowY: "auto" },

    // Components
    btnToolbar: { marginRight: 10, padding: "6px 15px", background: "#333", color: "#ddd", border: "1px solid #444", borderRadius: 2, fontSize: 12, cursor: "pointer" },
    btnPrimary: { marginRight: 10, padding: "6px 20px", background: colors.accent, color: "white", border: "none", borderRadius: 2, fontSize: 13, cursor: "pointer", fontWeight: "bold" },

    table: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13, background: "#252526" },
    th: { textAlign: "left", borderBottom: "1px solid #444", padding: 8, color: "#ccc" },
    td: { padding: 8, borderBottom: "1px solid #333", color: "#ddd" },
    inputTable: { background: "#444", border: "1px solid #555", color: "#fff", width: "100%", padding: 2 },

    sectionHeader: { borderBottom: "1px solid #444", paddingBottom: 10, marginBottom: 15, fontSize: 16, fontWeight: "bold", color: "#fff" },
    formGrid: { display: "grid", gridTemplateColumns: "150px 1fr", gap: 15, marginBottom: 10, alignItems: "center" },
    label: { color: "#aaa", fontSize: 13 },
    input: { background: "#333", border: "1px solid #555", color: "#fff", padding: 5, width: "100%", maxWidth: 300 },
    subItem: { padding: "5px 10px 5px 25px", cursor: "pointer", color: "#ddd", fontSize: 13 }
};
