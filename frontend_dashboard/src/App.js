import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./state/AuthContext";
import { DashboardPage } from "./pages/Dashboard";
import { OperatorEventsPage } from "./pages/OperatorEvents";
import { SupervisorPage } from "./pages/Supervisor";
import { ManagerPage } from "./pages/Manager";
import { SettingsPage } from "./pages/Settings";
import { RoleRoute } from "./components/RoleRoute";

// PUBLIC_INTERFACE
function App() {
  /** Application entry with routing + role-based navigation. */
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/events" element={<OperatorEventsPage />} />
          <Route
            path="/supervisor"
            element={
              <RoleRoute allow={["supervisor", "manager"]}>
                <SupervisorPage />
              </RoleRoute>
            }
          />
          <Route
            path="/manager"
            element={
              <RoleRoute allow={["manager"]}>
                <ManagerPage />
              </RoleRoute>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<DashboardPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
