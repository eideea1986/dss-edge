import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import React, { Suspense, lazy } from "react";

// Lazy‑load page components
const Live = lazy(() => import("./pages/Live"));
const Playback = lazy(() => import("./pages/Playback"));
const Status = lazy(() => import("./pages/Status"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const RequireAuth = lazy(() => import("./components/RequireAuth"));
const ErrorBoundary = lazy(() => import("./components/ErrorBoundary"));

const MainContent = () => {
    const location = useLocation();
    const isLive = location.pathname === "/" || location.pathname === "/live";

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#000', overflow: 'hidden' }}>
            <Navbar />
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#888" }}>Încărcare...</div>}>

                    {/* PERSISTENT LIVE PAGE: Always mounted, just hidden via CSS */}
                    <div style={{
                        display: isLive ? 'block' : 'none',
                        height: '100%', width: '100%',
                        position: 'absolute', top: 0, left: 0,
                        zIndex: isLive ? 1 : -1
                    }}>
                        <RequireAuth>
                            <Live />
                        </RequireAuth>
                    </div>

                    {/* OTHER PAGES: Rendered typically via Routes */}
                    <div style={{
                        display: !isLive ? 'block' : 'none',
                        height: '100%', width: '100%',
                        position: 'absolute', top: 0, left: 0,
                        zIndex: !isLive ? 1 : -1,
                        background: '#1e1e1e' // Ensure background covers Live when active
                    }}>
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            {/* Live route removed from here as it is handled manually above */}
                            <Route path="/playback" element={<RequireAuth><Playback /></RequireAuth>} />
                            <Route path="/status" element={<RequireAuth><Status /></RequireAuth>} />
                            <Route path="/settings" element={<RequireAuth><ErrorBoundary><Settings /></ErrorBoundary></RequireAuth>} />
                        </Routes>
                    </div>

                </Suspense>
            </div>
        </div>
    );
};

export default function App() {
    return (
        <HashRouter>
            <style>{`
                /* GRID FILL FIX */
                video, img, canvas, .rtc-player {
                    object-fit: fill !important; 
                    width: 100% !important; 
                    height: 100% !important;
                    display: block !important;
                    min-width: 100% !important;
                    min-height: 100% !important;
                }
                body { margin: 0; padding: 0; background: #000; overflow: hidden; }
            `}</style>
            <MainContent />
        </HashRouter>
    );
}
