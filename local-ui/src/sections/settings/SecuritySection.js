import React, { useState } from "react";
import { API } from "../../api";
import { Trash } from "../../components/Icons";

const styles = {
    input: { background: "#333", border: "1px solid #555", color: "#fff", padding: 5, width: "100%", maxWidth: 300 },
    label: { color: "#aaa", fontSize: 13 },
    btnPrimary: { marginRight: 10, padding: "6px 20px", background: "#007acc", color: "white", border: "none", borderRadius: 2, fontSize: 13, cursor: "pointer", fontWeight: "bold" },
    btnToolbar: { marginRight: 10, padding: "6px 15px", background: "#333", color: "#ddd", border: "1px solid #444", borderRadius: 2, fontSize: 12, cursor: "pointer" },
};

export function AddUserSection({ newUserForm, setNewUserForm, handleAddUser }) {
    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>Add User</h2>
            <div style={{ background: "#252526", padding: 20, border: "1px solid #444", maxWidth: 500 }}>
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Login</label>
                    <input style={{ ...styles.input, width: "100%" }} value={newUserForm.username} onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })} />
                </div>
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Password</label>
                    <input type="password" style={{ ...styles.input, width: "100%" }} value={newUserForm.password} onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })} />
                </div>
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "#ccc" }}>Confirm password</label>
                    <input type="password" style={{ ...styles.input, width: "100%" }} value={newUserForm.confirm} onChange={e => setNewUserForm({ ...newUserForm, confirm: e.target.value })} />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button style={styles.btnPrimary} onClick={handleAddUser}>Create User</button>
                </div>
            </div>
        </div>
    );
}

export function UserSettingsSection({ selectedUser, setSelectedUser, currentUser, handleDeleteUser, loadUsers }) {
    const toggleMenu = (menuId) => {
        const current = selectedUser.menus || [];
        const next = current.includes(menuId)
            ? current.filter(m => m !== menuId)
            : [...current, menuId];
        setSelectedUser({ ...selectedUser, menus: next });
    };

    const savePerms = async () => {
        if (currentUser.role !== 'admin') return;
        try {
            await API.put(`/auth/users/${selectedUser.id}`, { menus: selectedUser.menus });
            alert("Permisiuni salvate cu succes!");
            loadUsers();
        } catch (e) { alert("Eroare salvare: " + e.message); }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: "#fff" }}>User Settings - {selectedUser.name}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                        <div style={{ fontSize: 40, marginRight: 20 }}>{selectedUser.icon}</div>
                        <div style={{ flex: 1 }}>
                            <label style={styles.label}>User name:</label>
                            <input style={{ ...styles.input, width: "100%" }} value={selectedUser.name} readOnly disabled={true} />
                            {currentUser.role === 'admin' && selectedUser.role !== 'admin' && (
                                <button style={{ ...styles.btnToolbar, marginTop: 10, color: "#f44336" }} onClick={() => handleDeleteUser(selectedUser.name)}>[Del] Delete user</button>
                            )}
                        </div>
                    </div>

                    <div style={{ marginTop: 20, border: "1px solid #444", padding: 15, background: "#222" }}>
                        <h4 style={{ marginTop: 0, marginBottom: 15, color: "#ccc" }}>Acces Meniuri (Vizibilitate)</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                            {[
                                { id: "LIVE", label: "Monitorizare Live" },
                                { id: "ARCHIVE", label: "Arhiva Inregistrari" },
                                { id: "SETTINGS", label: "Setari Sistem" },
                                { id: "HARDWARE", label: "Gestionare Hardware" },
                                { id: "NETWORK", label: "Setari Retea" }
                            ].map(m => (
                                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: "#ddd" }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedUser.menus?.includes(m.id)}
                                        onChange={() => toggleMenu(m.id)}
                                        disabled={currentUser.role !== 'admin'}
                                    />
                                    {m.label}
                                </label>
                            ))}
                        </div>
                        {currentUser.role === 'admin' && (
                            <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 20 }} onClick={savePerms}>Salveaza Permisiuni</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
