import { HashRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import React, { Suspense, lazy } from "react";

// Lazy‑load page components
const Status = lazy(() => import("./pages/Status"));
const Settings = lazy(() => import("./pages/Settings"));
const Live = lazy(() => import("./pages/Live"));
const Playback = lazy(() => import("./pages/Playback"));
const Login = lazy(() => import("./pages/Login"));
const RequireAuth = lazy(() => import("./components/RequireAuth"));
const ErrorBoundary = lazy(() => import("./components/ErrorBoundary"));

const MainContent = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#000', overflow: 'hidden' }}>
            <Navbar />
            <div style={{ flex: 1, position: "relative", overflow: "hidden", background: '#1b1d21' }}>
                <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#888" }}>Încărcare...</div>}>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/status" element={<RequireAuth><Status /></RequireAuth>} />
                        <Route path="/live" element={<RequireAuth><ErrorBoundary><Live /></ErrorBoundary></RequireAuth>} />
                        <Route path="/playback" element={<RequireAuth><ErrorBoundary><Playback /></ErrorBoundary></RequireAuth>} />
                        <Route path="/settings" element={<RequireAuth><ErrorBoundary><Settings /></ErrorBoundary></RequireAuth>} />
                        <Route path="/" element={<Navigate to="/live" replace />} />
                        <Route path="*" element={<Navigate to="/live" replace />} />
                    </Routes>
                </Suspense>
            </div>
        </div>
    );
};

export default function App() {
    return (
        <HashRouter>
            <style>{`
                :root {
                    --bg-dark: #1b1d21;
                    --bg-panel: #25282e;
                    --text-primary: #e0e6ed;
                    --accent-green: #2ea043;
                    --border-color: #383b40;
                }
                body { margin: 0; padding: 0; background: var(--bg-dark); overflow: hidden; font-family: "Segoe UI", "Roboto", "Helvetica Neue", sans-serif; color: var(--text-primary); }
                * { box-sizing: border-box; }
                
                /* Custom Scrollbar */
                ::-webkit-scrollbar { width: 8px; height: 8px; }
                ::-webkit-scrollbar-track { background: #1b1d21; }
                ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #555; }
            `}</style>
            <MainContent />
        </HashRouter>
    );
}
