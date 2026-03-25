import React, { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

const ROLES = ["operator", "supervisor", "manager"];

// PUBLIC_INTERFACE
export function AuthProvider({ children }) {
  /** Provides local-only "auth" state: role selection to drive role-based UI. */
  const [role, setRole] = useState(() => {
    const saved = window.localStorage.getItem("oee.role");
    return ROLES.includes(saved) ? saved : "operator";
  });

  const value = useMemo(() => {
    return {
      role,
      setRole: (nextRole) => {
        const safe = ROLES.includes(nextRole) ? nextRole : "operator";
        window.localStorage.setItem("oee.role", safe);
        setRole(safe);
      },
      roles: ROLES
    };
  }, [role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// PUBLIC_INTERFACE
export function useAuth() {
  /** Access current role and role setter. */
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
