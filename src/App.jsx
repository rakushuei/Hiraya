/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import { ManufacturerPortal } from "./pages/ManufacturerPortal";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard/*" element={<DashboardPage />} />
        <Route path="/portal" element={<ManufacturerPortal />} />
      </Routes>
    </Router>
  );
}
