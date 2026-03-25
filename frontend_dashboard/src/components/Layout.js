import React, { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: "📈" },
  { to: "/events", label: "Operator Events", icon: "🧾", roles: ["operator", "supervisor", "manager"] },
  { to: "/supervisor", label: "Supervisor", icon: "🧭", roles: ["supervisor", "manager"] },
  { to: "/manager", label: "Manager", icon: "🏭", roles: ["manager"] },
  { to: "/settings", label: "Settings", icon: "⚙️" }
];

// PUBLIC_INTERFACE
export function Layout({ title, subtitle, status, children }) {
  /**
   * App layout with sidebar navigation and header status indicators.
   * @param {{connected:boolean, mode:'ws'|'mock'|'rest', error?:string}} status
   */
  const { role, setRole, roles } = useAuth();

  const visibleNav = useMemo(() => {
    return NAV.filter((n) => !n.roles || n.roles.includes(role));
  }, [role]);

  return (
    <div className="appRoot">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">OEE</div>
          <div className="brandTitle">
            <strong>Ocean OEE Monitor</strong>
            <span>Real-time plant performance</span>
          </div>
        </div>

        <div className="navGroupTitle">Navigate</div>
        <nav className="navList" aria-label="Primary">
          {visibleNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `navItem ${isActive ? "navItemActive" : ""}`}
              end={n.to === "/"}
            >
              <span className="navIcon" aria-hidden="true">
                {n.icon}
              </span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebarFooter">
          <div className="field">
            <div className="roleSelectLabel">Role</div>
            <select className="roleSelect" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="helperText">
            Role-based navigation is local-only for now. Hook this into your auth provider when backend is available.
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div className="headerTitle">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="headerRight">
            <span className="pill" title={status?.error || ""}>
              <span className={`pillDot ${status?.connected ? "pillDotOnline" : ""}`} />
              {status?.mode === "ws" ? "WebSocket" : status?.mode === "mock" ? "Mock Live" : "REST"}{" "}
              {status?.connected ? "Connected" : "Offline"}
            </span>
            <a className="btnGhost" href="https://oee.com" target="_blank" rel="noreferrer">
              OEE basics
            </a>
          </div>
        </header>

        <div className="content">{children}</div>
      </main>
    </div>
  );
}
