import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { API } from "../api";

// Design System & Components
import { colors, styles } from "../theme";
import ScheduleEditor from "../components/ScheduleInput";
import ArmingMatrix from "../components/ArmingMatrix";
import Status from "./Status";
import CameraWizard from "./CameraWizard";

// Icons
import {
    Trash, Edit, SettingsIcon, Lock, AlertTriangle, Save,
    Camera, Video, Archive, ChevronRight, RefreshCw
} from "../components/Icons";

// Modularized Sections
import {
    NetworkInterfaceSection,
    VPNSettingsSection,
    DispatchFailoverSection,
    SystemPortsSection
} from "../sections/settings/NetworkSection";

import {
    AddUserSection,
    UserSettingsSection
} from "../sections/settings/SecuritySection";

import {
    OrphansSection,
    ArchiveSettingsSection
} from "../sections/settings/StorageSection";

import { AISection } from "../sections/settings/AISection";

import {
    IPDevicesRootSection,
    CameraSettingsSection,
    ChannelSettingsSection
} from "../sections/settings/HardwareSection";

import {
    SystemLogsSection,
    ServiceMaintenanceSection,
    RebootSection
} from "../sections/settings/MaintenanceSection";

import CameraEditModal from "../sections/settings/CameraEditModal";

// Hook for fetching models (Shared)
function useModels() {
    const [data, setData] = useState({ manufacturers: [], models: {}, capabilities: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.get("/models")
            .then(res => {
                const mfgList = res.data.manufacturers.map(m => m.name).sort();
                const modelMap = res.data.manufacturers.reduce((acc, m) => {
                    acc[m.name] = m.models;
                    return acc;
                }, {});

                API.get("/models/capabilities").then(capRes => {
                    setData({ manufacturers: mfgList, models: modelMap, capabilities: capRes.data || {} });
                    setLoading(false);
                }).catch(() => {
                    setData({ manufacturers: mfgList, models: modelMap, capabilities: {} });
                    setLoading(false);
                });
            })
            .catch(e => {
                console.error("Failed to load models", e);
                setLoading(false);
            });
    }, []);

    return { ...data, loading };
}

export default function Settings() {
    const location = useLocation();
    // --- STATE ---
    const [selection, setSelection] = useState({ type: "SYSTEM", id: null, subTab: "SERVER" });
    const [expanded, setExpanded] = useState({ SETTINGS: false, HARDWARE: false, IP_DEVICES: false, NETWORK: false, USERS: false, MAINTENANCE: false, CHANNELS: false, ARMING: false });

    // Core Data
    const [cams, setCams] = useState([]);
    const [statusData, setStatusData] = useState({});
    const [services, setServices] = useState([]);
    const { manufacturers: MANUFACTURERS, models: MODELS, capabilities: CAPABILITIES } = useModels();
    const [availableModules, setAvailableModules] = useState([]);

    // Network & Environment
    const [networkConfig, setNetworkConfig] = useState({ mode: "dhcp", ip: "", netmask: "", gateway: "", dns1: "", dns2: "", edgeName: "DSS-SMART GUARD" });
    const [netConfig, setNetConfig] = useState({});

    // User Management
    const [mockUsers, setMockUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(() => {
        const saved = localStorage.getItem("edge_user");
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { }
        }
        return { name: "Guest", role: "operator", id: -1 };
    });
    const [selectedUser, setSelectedUser] = useState(null);
    const [newUserForm, setNewUserForm] = useState({ username: "", password: "", confirm: "", role: "operator" });
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    // Arming State
    const [armingSchedules, setArmingSchedules] = useState([]);
    const [armingAssignments, setArmingAssignments] = useState({});
    const [armingModes, setArmingModes] = useState({});
    const [armingLabels, setArmingLabels] = useState({});

    // Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editCam, setEditCam] = useState({});

    // --- DATA LOADING ---
    const loadCams = useCallback(() => {
        API.get("/cameras/config").then(res => setCams(res.data)).catch(e => console.error(e));
        API.get("/cameras/config").then(res => {
            const map = {};
            if (Array.isArray(res.data)) res.data.forEach(c => map[c.id] = c);
            setStatusData(map);
        }).catch(e => console.error(e));
    }, []);

    const loadServices = useCallback(() => {
        API.get("status/services").then(res => setServices(res.data)).catch(e => console.error(e));
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            const res = await API.get("auth/users");
            if (Array.isArray(res.data)) {
                setMockUsers(res.data.map(u => ({
                    id: u.id || u.username,
                    name: u.username,
                    icon: u.role === 'admin' ? "[A]" : "[O]",
                    role: u.role,
                    menus: u.menus || []
                })));
            }
        } catch (e) { console.error(e); }
    }, []);

    const loadNetwork = useCallback(() => {
        API.get("/network/config").then(res => setNetworkConfig(prev => ({ ...prev, ...res.data }))).catch(e => console.error(e));
        API.get("/network/all").then(res => setNetConfig(res.data)).catch(e => console.error(e));
    }, []);

    const loadArming = useCallback(async () => {
        try {
            const res = await API.get("/arming/data");
            setArmingSchedules(res.data.schedules || []);
            setArmingAssignments(res.data.assignments || {});
            setArmingModes(res.data.modes || {});
            setArmingLabels(res.data.labels || {});
        } catch (e) { console.error("Failed to load arming data", e); }
    }, []);

    useEffect(() => {
        loadCams();
        loadServices();
        loadUsers();
        loadNetwork();
        loadArming();

        API.get("/ai/modules").then(res => setAvailableModules(Array.isArray(res.data) ? res.data : [])).catch(() => setAvailableModules([]));

        const user = localStorage.getItem("edge_user");
        if (user) {
            try { setCurrentUser(JSON.parse(user)); } catch (e) { }
        }

        // --- DEEP LINKING LOGIC ---
        const params = new URLSearchParams(location.search);
        const tab = params.get("tab");
        const camId = params.get("camId");

        if (tab === "hardware" && camId) {
            setSelection({ type: "CAMERA", id: camId });
            setExpanded(prev => ({ ...prev, HARDWARE: true, IP_DEVICES: true }));
        } else if (tab === "channels" && camId) {
            setSelection({ type: "CHANNEL", id: camId });
            setExpanded(prev => ({ ...prev, CHANNELS: true }));
        } else if (tab === "arming") {
            setExpanded(prev => ({ ...prev, ARMING: true }));
            setSelection({ type: "ARMING_MATRIX" });
        }

        const interval = setInterval(() => {
            API.get("/cameras/config").then(res => {
                const map = {};
                if (Array.isArray(res.data)) res.data.forEach(c => map[c.id] = c);
                setStatusData(map);
            }).catch(e => console.error(e));
            loadServices();
            loadNetwork();
        }, 5000);
        return () => clearInterval(interval);
    }, [loadCams, loadServices, loadUsers, loadNetwork, loadArming, location.search]);

    // --- AUTO-EXPAND SIDEBAR & SCROLL ---
    useEffect(() => {
        if (!selection) return;

        // 1. Expand relevant parent menus (Clean and enforce single-open rule)
        if (selection.type === "CAMERA" || selection.type === "IP_DEVICES_ROOT" || selection.type === "ARCHIVE" || selection.type === "WIZARD") {
            setExpanded({ SETTINGS: false, HARDWARE: true, IP_DEVICES: selection.type === "CAMERA", NETWORK: false, USERS: false, MAINTENANCE: false, CHANNELS: false, ARMING: false });
        } else if (selection.type === "CHANNEL") {
            setExpanded({ SETTINGS: false, HARDWARE: false, IP_DEVICES: false, NETWORK: false, USERS: false, MAINTENANCE: false, CHANNELS: true, ARMING: false });
        } else if (selection.type === "USER" || selection.type === "ADD_USER" || selection.type === "SYSTEM" || selection.type === "AI_HUB" || selection.type === "ORPHANS" || selection.type === "SYSTEM_LOGS") {
            const isSettingsSub = selection.type === "USER" || selection.type === "ADD_USER" || selection.type === "MAINTENANCE_SERVICES" || selection.type === "MAINTENANCE_REBOOT" || selection.type === "NETWORK_INTERFACE" || selection.type === "NETWORK_VPN" || selection.type === "NETWORK_SERVER" || selection.type === "NETWORK_PORTS";

            setExpanded({
                SETTINGS: true,
                HARDWARE: false,
                USERS: (selection.type === "USER" || selection.type === "ADD_USER"),
                MAINTENANCE: (selection.type === "MAINTENANCE_SERVICES" || selection.type === "MAINTENANCE_REBOOT"),
                NETWORK: (selection.type === "NETWORK_INTERFACE" || selection.type === "NETWORK_VPN" || selection.type === "NETWORK_SERVER" || selection.type === "NETWORK_PORTS"),
                IP_DEVICES: false, CHANNELS: false, ARMING: false
            });
        }
        else if (selection.type.startsWith("ARMING")) {
            setExpanded(prev => ({ ...prev, ARMING: true }));
        } else if (["SYSTEM", "AI_HUB", "ADD_USER", "USER", "ORPHANS", "MAINTENANCE_SERVICES", "MAINTENANCE_REBOOT", "SYSTEM_LOGS", "NETWORK_INTERFACE", "NETWORK_VPN", "NETWORK_SERVER", "NETWORK_PORTS"].includes(selection.type)) {
            setExpanded(prev => ({ ...prev, SETTINGS: true }));
            if (selection.type === "ADD_USER" || selection.type === "USER") setExpanded(prev => ({ ...prev, USERS: true }));
            if (selection.type.startsWith("MAINTENANCE")) setExpanded(prev => ({ ...prev, MAINTENANCE: true }));
            if (selection.type.startsWith("NETWORK")) setExpanded(prev => ({ ...prev, NETWORK: true }));
        }

        // 2. Scroll into view (defer and slightly wait for render)
        setTimeout(() => {
            const activeId = selection.type === "CHANNEL" ? `sidebar_ch_${selection.id}` :
                selection.type === "CAMERA" ? `sidebar_hw_${selection.id}` :
                    selection.type === "USER" ? `sidebar_user_${selection.id}` : null;

            if (activeId) {
                const el = document.getElementById(activeId);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }, 150);
    }, [selection.type, selection.id]);


    // --- HANDLERS ---
    const saveAllCams = async (updated) => {
        try { await API.post("/cameras/config", updated || cams); loadCams(); }
        catch (e) { alert("Error saving: " + e.message); }
    };

    const updateCam = (id, field, value) => {
        const next = cams.map(c => c.id === id ? { ...c, [field]: value } : c);
        setCams(next);
    };

    const deleteCam = async (id) => {
        if (!window.confirm("Delete camera?")) return;
        try { await API.delete(`/cameras/${id}`); setSelection({ type: "IP_DEVICES_ROOT" }); loadCams(); }
        catch (e) { alert("Error deleting: " + e.message); }
    };

    const handleAddUser = async () => {
        if (newUserForm.password !== newUserForm.confirm) return alert("Nu corespund parolele!");
        try {
            await API.post("/auth/users", newUserForm);
            alert("Utilizator creat!");
            setNewUserForm({ username: "", password: "", confirm: "", role: "operator" });
            loadUsers();
            setSelection({ type: "SYSTEM" });
        } catch (e) { alert("Eroare: " + e.message); }
    };

    const handleDeleteUser = async (username) => {
        if (!window.confirm(`Sunteti sigur ca stergeti utilizatorul ${username}?`)) return;
        try {
            await API.delete(`/auth/users/${username}`);
            loadUsers();
            setSelection({ type: "SYSTEM" });
        } catch (e) { alert("Eroare stergere: " + e.message); }
    };

    const handleRestartStack = async () => {
        if (!window.confirm("Restart critical services?")) return;
        try { await API.post("/status/restart-stack"); alert("Command sent."); } catch (e) { alert(e.message); }
    };

    // Arming Handlers
    const handleSaveSchedules = async (newSchedules) => {
        try { await API.post("/arming/schedules", newSchedules); setArmingSchedules(newSchedules); } catch (e) { alert(e.message); }
    };
    const handleToggleSchedule = async (idx, isEnabled) => {
        const updated = [...armingSchedules];
        if (updated[idx]) { updated[idx] = { ...updated[idx], enabled: !isEnabled }; await handleSaveSchedules(updated); }
    };
    const handleSaveAssignments = async (newAssignments) => {
        try { await API.post("/arming/assignments", newAssignments); setArmingAssignments(newAssignments); } catch (e) { alert(e.message); }
    };
    const handleSaveModes = async (newModes) => {
        try { await API.post("/arming/modes", newModes); setArmingModes(prev => ({ ...prev, ...newModes })); } catch (e) { alert(e.message); }
    };
    const handleSaveLabels = async (newLabels) => {
        try { await API.post("/arming/labels", newLabels); setArmingLabels(prev => ({ ...prev, ...newLabels })); } catch (e) { alert(e.message); }
    };

    // --- RENDER HELPERS ---
    const toggleExpand = (key) => setExpanded(prev => {
        const isCurrentlyOpen = prev[key];
        // Reset all
        const next = { SETTINGS: false, HARDWARE: false, IP_DEVICES: false, NETWORK: false, USERS: false, MAINTENANCE: false, CHANNELS: false, ARMING: false };

        const settingsSub = ["USERS", "NETWORK", "MAINTENANCE"];

        if (settingsSub.includes(key)) {
            next.SETTINGS = true; // Keep parent open
            next[key] = !isCurrentlyOpen;
        } else if (key === "IP_DEVICES") {
            next.HARDWARE = true; // Keep parent open
            next[key] = !isCurrentlyOpen;
        } else if (key === "SETTINGS" || key === "HARDWARE" || key === "CHANNELS" || key === "ARMING") {
            // Main groups
            next[key] = !isCurrentlyOpen;
        } else {
            next[key] = !isCurrentlyOpen;
        }
        return next;
    });
    const hasAccess = (menuId) => currentUser.role === 'admin' || (currentUser.menus && currentUser.menus.includes(menuId));

    const renderContent = () => {
        switch (selection.type) {
            case "SYSTEM": return <Status />;
            case "AI_HUB": return <AISection />;
            case "NETWORK_INTERFACE": return <NetworkInterfaceSection networkConfig={networkConfig} setNetworkConfig={setNetworkConfig} saveNetwork={() => API.post("/network/config", networkConfig).then(() => alert("Saved"))} />;
            case "NETWORK_VPN": return (
                <VPNSettingsSection
                    netConfig={netConfig}
                    setNetConfig={setNetConfig}
                    connectVPN={async (iface) => {
                        const prefix = iface;
                        const payload = {
                            interface: iface,
                            address: netConfig[`${prefix}_address`],
                            privateKey: netConfig[`${prefix}_privateKey`],
                            publicKey: netConfig[`${prefix}_serverPubKey`],
                            endpoint: netConfig[`${prefix}_endpoint`],
                            allowedIps: netConfig[`${prefix}_allowedIps`],
                            persistentKeepalive: 25
                        };
                        try {
                            const res = await API.post("/vpn/setup-wireguard", payload);
                            alert(res.data.message || "VPN Command Sent!");
                            loadNetwork();
                        } catch (e) { alert("VPN Error: " + (e.response?.data?.error || e.message)); }
                    }}
                    saveImportedVPN={async (bundle) => {
                        try {
                            // Save Management (WG0)
                            await API.post("/vpn/setup-wireguard", {
                                interface: "wg0",
                                address: bundle.mgmt.interface.address,
                                privateKey: bundle.mgmt.interface.privateKey,
                                publicKey: bundle.mgmt.peer.publicKey,
                                endpoint: bundle.mgmt.peer.endpoint,
                                allowedIps: bundle.mgmt.peer.allowedIps,
                                persistentKeepalive: 25
                            });

                            // Save AI (WG1)
                            await API.post("/vpn/setup-wireguard", {
                                interface: "wg1",
                                address: bundle.ai.interface.address,
                                privateKey: bundle.ai.interface.privateKey,
                                publicKey: bundle.ai.peer.publicKey,
                                endpoint: bundle.ai.peer.endpoint,
                                allowedIps: bundle.ai.peer.allowedIps,
                                persistentKeepalive: 25
                            });

                            // Update Dispatch URL for events
                            // Check if we have a way to save dispatch URL from import? 
                            // Usually it's just the VPN endpoint IP, but let's stick to VPN for now.

                            alert("Configurația VPN Duală a fost aplicată cu succes! Sistemul se conectează...");
                            loadNetwork();
                        } catch (e) {
                            alert("Eroare la salvarea VPN: " + e.message);
                        }
                    }}
                    connectDualVPN={async () => {
                        const interfaces = ["wg0", "wg1"];
                        let successCount = 0;
                        for (const iface of interfaces) {
                            const prefix = iface;
                            const payload = {
                                interface: iface,
                                address: netConfig[`${prefix}_address`],
                                privateKey: netConfig[`${prefix}_privateKey`],
                                publicKey: netConfig[`${prefix}_serverPubKey`],
                                endpoint: netConfig[`${prefix}_endpoint`],
                                allowedIps: netConfig[`${prefix}_allowedIps`],
                                persistentKeepalive: 25
                            };
                            if (!payload.privateKey || !payload.publicKey) continue;
                            try {
                                await API.post("/vpn/setup-wireguard", payload);
                                successCount++;
                            } catch (e) { console.error(`Failed to start ${iface}`, e); }
                        }
                        if (successCount > 0) {
                            alert(`Comandă trimisă pentru ${successCount} interfețe.`);
                            loadNetwork();
                        } else {
                            alert("Nu s-au găsit date complete pentru ambele interfețe.");
                        }
                    }}
                />
            );
            case "NETWORK_SERVER": return <DispatchFailoverSection netConfig={netConfig} setNetConfig={setNetConfig} saveDispatch={() => API.post("/dispatch", { url: netConfig.dispatchUrl }).then(() => alert("Dispatch URL saved! Events will now be sent to this server."))} />;
            case "NETWORK_PORTS": return <SystemPortsSection />;
            case "ADD_USER": return <AddUserSection newUserForm={newUserForm} setNewUserForm={setNewUserForm} handleAddUser={handleAddUser} />;
            case "USER": {
                const u = selectedUser || mockUsers.find(x => x.id === selection.id);
                return u ? <UserSettingsSection selectedUser={u} setSelectedUser={(updated) => { setMockUsers(prev => prev.map(x => x.id === updated.id ? updated : x)); setSelectedUser(updated); }} currentUser={currentUser} handleDeleteUser={handleDeleteUser} loadUsers={loadUsers} /> : null;
            }
            case "ORPHANS": return <OrphansSection />;
            case "ARCHIVE": return <ArchiveSettingsSection cams={cams} />;
            case "IP_DEVICES_ROOT": return <IPDevicesRootSection cams={cams} statusData={statusData} onSelectCam={(id) => setSelection({ type: "CAMERA", id })} onEditCam={(c) => { setEditCam(c); setIsEditModalOpen(true); }} onDeleteCam={deleteCam} />;
            case "CAMERA": {
                const cam = cams.find(c => c.id === selection.id);
                return <CameraSettingsSection cam={cam} statusData={statusData} updateCam={updateCam} saveAll={saveAllCams} deleteCam={deleteCam} openEditModal={(c) => { setEditCam(c); setIsEditModalOpen(true); }} setSelection={setSelection} />;
            }
            case "CHANNEL": {
                const cam = cams.find(c => c.id === selection.id);
                return <ChannelSettingsSection cam={cam} cams={cams} setCams={setCams} setSelection={setSelection} availableModules={availableModules} updateCam={updateCam} saveAll={saveAllCams} />;
            }
            case "SYSTEM_LOGS": return <SystemLogsSection />;
            case "MAINTENANCE_SERVICES": return <ServiceMaintenanceSection services={services} onRestartStack={handleRestartStack} />;
            case "MAINTENANCE_REBOOT": return <RebootSection />;
            case "WIZARD": return <CameraWizard
                onUpdate={loadCams}
                onFinish={() => { loadCams(); setSelection({ type: "IP_DEVICES_ROOT" }); }}
                onOpenSetup={(newCam) => { setEditCam(newCam || {}); setIsEditModalOpen(true); }}
            />;
            case "ARMING_SCHEDULES": return <ScheduleEditor schedules={armingSchedules} onSave={handleSaveSchedules} />;
            case "ARMING_MATRIX": return <ArmingMatrix schedules={armingSchedules} cams={cams} assignments={armingAssignments} modes={armingModes} labels={armingLabels} onSave={handleSaveAssignments} onSaveModes={handleSaveModes} onSaveLabels={handleSaveLabels} onToggleSchedule={handleToggleSchedule} />;
            default: return <div style={{ padding: 20 }}>Select an item from the sidebar</div>;
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.main}>
                {/* SIDEBAR */}
                <div style={styles.sidebar}>
                    <div style={{ padding: 10, borderBottom: `1px solid ${colors.border}`, fontWeight: "bold", cursor: "pointer" }} onDoubleClick={() => setIsEditingTitle(true)}>
                        {isEditingTitle ? (
                            <input
                                autoFocus
                                value={networkConfig.edgeName}
                                onChange={(e) => setNetworkConfig({ ...networkConfig, edgeName: e.target.value })}
                                onBlur={() => { setIsEditingTitle(false); API.post("network/config", networkConfig); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditingTitle(false); API.post("network/config", networkConfig); } }}
                                style={{ width: "100%", background: "#333", color: "#fff", border: "1px solid #007acc", padding: "2px 5px", borderRadius: 2 }}
                            />
                        ) : (networkConfig.edgeName || "DSS-SMART GUARD")}
                    </div>

                    {/* SETARI SISTEM GROUP */}
                    <div onClick={() => toggleExpand("SETTINGS")} style={{ padding: "8px 10px", cursor: "pointer", background: "#222", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5, borderTop: "1px solid #444", color: "#aaa" }}>
                        <ChevronRight size={14} style={{ transform: expanded.SETTINGS ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }} /> SETARI SISTEM
                    </div>
                    {expanded.SETTINGS && (
                        <div style={{ background: "#1a1a1a", borderBottom: "1px solid #333" }}>
                            {hasAccess("SYSTEM") && <div onClick={() => setSelection({ type: "SYSTEM" })} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, background: selection.type === "SYSTEM" ? "#094771" : "transparent" }}>Status Sistem</div>}
                            {hasAccess("SYSTEM") && <div onClick={() => setSelection({ type: "AI_HUB" })} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, background: selection.type === "AI_HUB" ? "#094771" : "transparent" }}>AI Engine Hub</div>}

                            {hasAccess("USERS") && (
                                <>
                                    <div onClick={() => toggleExpand("USERS")} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, display: "flex", alignItems: "center" }}>
                                        <ChevronRight size={14} style={{ transform: expanded.USERS ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }} /> Utilizatori
                                    </div>
                                    {expanded.USERS && (
                                        <div style={{ background: "#111" }}>
                                            <div onClick={() => setSelection({ type: "ADD_USER" })} style={{ ...styles.subItem, paddingLeft: 45, color: colors.success, background: selection.type === "ADD_USER" ? "#333" : "transparent" }}>+ Adauga Utilizator</div>
                                            {mockUsers.map(u => (
                                                <div key={u.id} id={`sidebar_user_${u.id}`} onClick={() => { setSelection({ type: "USER", id: u.id }); setSelectedUser(u); }} style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "USER" && selection.id === u.id) ? "#333" : "transparent" }}>{u.name}</div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {hasAccess("ORPHANS") && <div onClick={() => setSelection({ type: "ORPHANS" })} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, background: selection.type === "ORPHANS" ? "#094771" : "transparent", display: "flex", alignItems: "center" }}><Trash size={14} style={{ marginRight: 5 }} /> Camere Sterse</div>}

                            {hasAccess("MAINTENANCE") && (
                                <>
                                    <div onClick={() => toggleExpand("MAINTENANCE")} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, display: "flex", alignItems: "center" }}>
                                        <ChevronRight size={14} style={{ transform: expanded.MAINTENANCE ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }} /> Mentenanta
                                    </div>
                                    {expanded.MAINTENANCE && (
                                        <div style={{ background: "#111" }}>
                                            <div onClick={() => setSelection({ type: "MAINTENANCE_SERVICES" })} style={{ ...styles.subItem, paddingLeft: 45, background: selection.type === "MAINTENANCE_SERVICES" ? "#333" : "transparent" }}>Stare Servicii</div>
                                            <div onClick={() => setSelection({ type: "MAINTENANCE_REBOOT" })} style={{ ...styles.subItem, paddingLeft: 45, background: selection.type === "MAINTENANCE_REBOOT" ? "#333" : "transparent" }}>Repornire</div>
                                        </div>
                                    )}
                                </>
                            )}

                            {hasAccess("SYSTEM_LOGS") && <div onClick={() => setSelection({ type: "SYSTEM_LOGS" })} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, background: selection.type === "SYSTEM_LOGS" ? "#094771" : "transparent" }}>LOGS</div>}

                            {hasAccess("NETWORK") && (
                                <>
                                    <div onClick={() => toggleExpand("NETWORK")} style={{ padding: "8px 10px 8px 30px", cursor: "pointer", color: "#ccc", fontSize: 13, display: "flex", alignItems: "center" }}>
                                        <ChevronRight size={14} style={{ transform: expanded.NETWORK ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }} /> Retea
                                    </div>
                                    {expanded.NETWORK && (
                                        <div style={{ background: "#111" }}>
                                            <div onClick={() => setSelection({ type: "NETWORK_INTERFACE" })} style={{ ...styles.subItem, paddingLeft: 45, background: selection.type === "NETWORK_INTERFACE" ? "#333" : "transparent" }}>Interfata</div>
                                            <div onClick={() => setSelection({ type: "NETWORK_VPN" })} style={{ ...styles.subItem, paddingLeft: 45, background: selection.type === "NETWORK_VPN" ? "#333" : "transparent" }}>VPN</div>
                                            <div onClick={() => setSelection({ type: "NETWORK_SERVER" })} style={{ ...styles.subItem, paddingLeft: 45, background: selection.type === "NETWORK_SERVER" ? "#333" : "transparent" }}>Evenimente Server</div>
                                            <div onClick={() => setSelection({ type: "NETWORK_PORTS" })} style={{ ...styles.subItem, paddingLeft: 45, background: selection.type === "NETWORK_PORTS" ? "#333" : "transparent" }}>Porturi Sistem</div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* HARDWARE GROUP */}
                    {(hasAccess("HARDWARE") || hasAccess("ARCHIVE")) && (
                        <div onClick={() => toggleExpand("HARDWARE")} style={{ padding: "8px 10px", cursor: "pointer", background: "#333", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5 }}>
                            <ChevronRight size={14} style={{ transform: expanded.HARDWARE ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }} /> Hardware
                        </div>
                    )}
                    {expanded.HARDWARE && (
                        <>
                            {hasAccess("HARDWARE") && (
                                <>
                                    <div onClick={() => { toggleExpand("IP_DEVICES"); setSelection({ type: "IP_DEVICES_ROOT" }); }} style={{ ...styles.subItem, background: selection.type === "IP_DEVICES_ROOT" ? "#094771" : "transparent" }}>
                                        <ChevronRight size={14} style={{ transform: expanded.IP_DEVICES ? "rotate(90deg)" : "rotate(0deg)", marginRight: 5 }} /> Dispozitive IP
                                    </div>
                                    <div onClick={() => setSelection({ type: "WIZARD" })} style={{ ...styles.subItem, paddingLeft: 45, color: colors.success, fontWeight: "bold", background: selection.type === "WIZARD" ? "#094771" : "transparent" }}>+ Adauga Camera (WIZARD)</div>
                                    {expanded.IP_DEVICES && cams.map(c => {
                                        const isOnline = statusData[c.id]?.connected;
                                        return (
                                            <div key={"hw_" + c.id} id={`sidebar_hw_${c.id}`} onClick={() => setSelection({ type: "CAMERA", id: c.id })} style={{ ...styles.subItem, paddingLeft: 45, background: (selection.type === "CAMERA" && selection.id === c.id) ? "#094771" : "transparent", fontSize: 12, display: "flex", alignItems: "center" }}>
                                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: isOnline ? "#4caf50" : "#f44336", marginRight: 8, boxShadow: isOnline ? "0 0 4px #4caf50" : "none" }} />
                                                <Camera size={14} style={{ marginRight: 5 }} /> {c.name || c.ip}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                            {hasAccess("ARCHIVE") && <div onClick={() => setSelection({ type: "ARCHIVE" })} style={{ ...styles.subItem, background: selection.type === "ARCHIVE" ? "#094771" : "transparent" }}><Archive size={14} style={{ marginRight: 5 }} /> Arhiva</div>}
                        </>
                    )}

                    {/* CANALE GROUP */}
                    {hasAccess("HARDWARE") && (
                        <>
                            <div onClick={() => toggleExpand("CHANNELS")} style={{ padding: "8px 10px", cursor: "pointer", background: "#333", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5 }}>
                                <ChevronRight size={14} style={{ transform: expanded.CHANNELS ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }} /> Canale
                            </div>
                            {expanded.CHANNELS && cams.map(c => {
                                const isOnline = statusData[c.id]?.connected;
                                return (
                                    <div key={"ch_" + c.id} id={`sidebar_ch_${c.id}`} onClick={() => setSelection({ type: "CHANNEL", id: c.id })} style={{ ...styles.subItem, background: (selection.type === "CHANNEL" && selection.id === c.id) ? "#094771" : "transparent", fontSize: 12, display: "flex", alignItems: "center" }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: isOnline ? "#4caf50" : "#f44336", marginRight: 8, boxShadow: isOnline ? "0 0 4px #4caf50" : "none" }} />
                                        <Video size={14} style={{ marginRight: 5 }} /> {c.name || c.ip} - D1
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* ARMARE GROUP */}
                    <div onClick={() => toggleExpand("ARMING")} style={{ padding: "8px 10px", cursor: "pointer", background: "#333", display: "flex", alignItems: "center", fontSize: 13, marginTop: 5 }}>
                        <ChevronRight size={14} style={{ transform: expanded.ARMING ? "rotate(90deg)" : "rotate(0deg)", transition: "0.2s", marginRight: 5 }} /> Armare
                    </div>
                    {expanded.ARMING && (
                        <div>
                            <div onClick={() => setSelection({ type: "ARMING_SCHEDULES" })} style={{ ...styles.subItem, background: selection.type === "ARMING_SCHEDULES" ? "#094771" : "transparent" }}>Definire Orar</div>
                            <div onClick={() => setSelection({ type: "ARMING_MATRIX" })} style={{ ...styles.subItem, background: selection.type === "ARMING_MATRIX" ? "#094771" : "transparent" }}>Matrice Armare</div>
                        </div>
                    )}

                    <div style={{ marginTop: "auto", padding: 20 }}>
                        <div style={{ fontSize: 10, color: "#666", textAlign: "center", marginBottom: 10, fontFamily: "monospace" }}>
                            UI REVISION: 2026.01.08.1125<br />
                            (AI SCALE + AUTO-COLLAPSE SIDEBAR)
                        </div>
                        <button style={{ ...styles.btnPrimary, background: colors.danger, width: "100%", marginRight: 0 }} onClick={() => { localStorage.removeItem("edge_user"); window.location.reload(); }}>LOGOUT</button>
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div style={styles.content}>
                    {renderContent()}
                </div>
            </div>

            {isEditModalOpen && (
                <CameraEditModal
                    editCam={editCam}
                    setEditCam={setEditCam}
                    manufacturers={MANUFACTURERS}
                    onClose={() => setIsEditModalOpen(false)}
                    onSave={async () => {
                        try {
                            if (editCam.id && cams.some(c => c.id === editCam.id)) {
                                const updated = cams.map(c => c.id === editCam.id ? editCam : c);
                                await API.post("/cameras/config", updated);
                            } else {
                                await API.post("/cameras/add", editCam);
                                setSelection({ type: "IP_DEVICES_ROOT" }); // Redirect to list after add
                            }
                            setIsEditModalOpen(false);
                            loadCams();
                        } catch (e) {
                            alert("Save Error: " + (e.response?.data?.error || e.message));
                        }
                    }}
                />
            )}
        </div>
    );
}