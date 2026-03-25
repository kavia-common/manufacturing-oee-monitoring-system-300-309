import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

// PUBLIC_INTERFACE
export function RoleRoute({ allow, children }) {
  /**
   * Route guard based on current role.
   * @param {string[]} allow - roles allowed
   */
  const { role } = useAuth();
  if (!allow?.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
