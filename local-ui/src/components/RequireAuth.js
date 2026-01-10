import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function RequireAuth({ children }) {
    const location = useLocation();
    const user = localStorage.getItem("edge_user");

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}
