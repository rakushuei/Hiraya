import React from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Sidebar, DashboardTopbar } from "../components/dashboard/Layout";
import { Overview } from "../components/dashboard/Overview";
import { Inventory } from "../components/dashboard/Inventory";
import { Orders } from "../components/dashboard/Orders";
import { Shipments } from "../components/dashboard/Shipments";
import { Suppliers } from "../components/dashboard/Suppliers";
import { EDIFlow } from "../components/dashboard/EDIFlow";
import { EDISettings } from "../components/dashboard/Settings";
import { InvoiceBilling } from "../components/dashboard/InvoiceBilling";
import { useRTDBCollection } from "../hooks/useRTDBCollection";
import { auth, rtdb } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, set, update, get, remove } from "firebase/database";
import { 
  INITIAL_FABRICS, 
  INITIAL_SUPPLIERS, 
  INITIAL_POS, 
  INITIAL_SHIPMENTS, 
  INITIAL_ACTIVITIES 
} from "../data";
import { Settings as SettingsIcon } from "lucide-react";

const DashboardPage = () => {
  const navigate = useNavigate();
  const { data: fabrics, loading: fabricsLoading } = useRTDBCollection("fabrics");
  const { data: suppliers } = useRTDBCollection("suppliers");
  const { data: orders } = useRTDBCollection("orders");
  const { data: shipments } = useRTDBCollection("shipments");
  const { data: activities } = useRTDBCollection("activities");

  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const isMock = localStorage.getItem("mock_auth") === "true";
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else if (isMock) {
        setUser({ email: "admin@hiraya.io", displayName: "Admin User", uid: "mock-admin" });
      } else {
        navigate("/");
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const seedDatabase = async () => {
    try {
      const fabricsSnap = await get(ref(rtdb, "fabrics"));
      const suppliersSnap = await get(ref(rtdb, "suppliers"));
      
      const updates = {};
      
      if (!fabricsSnap.exists()) {
        INITIAL_FABRICS.forEach(f => {
          updates[`fabrics/${f.id}`] = f;
        });
      }

      if (!suppliersSnap.exists()) {
        INITIAL_SUPPLIERS.forEach(s => {
          updates[`suppliers/${s.id}`] = s;
        });
      }
      
      if (Object.keys(updates).length > 0) {
        await update(ref(rtdb), updates);
      }
    } catch (err) {
      console.error("Seeding error:", err);
    }
  };

  // Run purge once to clean up existing mock data from previous sessions
  React.useEffect(() => {
    const purgeOldData = async () => {
      // Use a flag in local storage to ensure this only runs once per browser session
      const hasPurged = localStorage.getItem("ts_final_wipe_v4_rtdb");
      if (hasPurged) return;

      const collectionsToPurge = ["orders", "shipments", "activities"];
      let needsReset = false;

      try {
        for (const coll of collectionsToPurge) {
          const snap = await get(ref(rtdb, coll));
          if (snap.exists()) {
            await remove(ref(rtdb, coll));
            needsReset = true;
          }
        }
        
        if (needsReset) {
          localStorage.setItem("ts_final_wipe_v4_rtdb", "true");
          window.location.reload(); // Refresh to show clean state
        } else {
          localStorage.setItem("ts_final_wipe_v4_rtdb", "true");
        }
      } catch (err) {
        console.error("Purge error:", err);
      }
    };

    if (user) purgeOldData(); 
  }, [user]);

  React.useEffect(() => {
    if (user) seedDatabase();
  }, [user]);

  if (!user || fabricsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Authenticating Global Node...</p>
        </div>
      </div>
    );
  }

  const setFabrics = async (newFabrics) => {
     // This is a helper for legacy component support, in real app we'd update individual docs
  };

  // Orders at step 0 that are not declined = unacknowledged POs
  const pendingOrderCount = orders.filter(o => o.workflowStep === 0 && !o.declined).length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} pendingOrderCount={pendingOrderCount} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <DashboardTopbar />
        <main className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route index element={<Overview fabrics={fabrics} activities={activities} orders={orders} suppliers={suppliers} />} />
            <Route path="inventory" element={<Inventory fabrics={fabrics} />} />
            <Route path="orders" element={<Orders orders={orders} fabrics={fabrics} />} />
            <Route path="edi" element={<EDIFlow orders={orders} fabrics={fabrics} />} />
            <Route path="shipments" element={<Shipments shipments={shipments} orders={orders} />} />
            <Route path="suppliers" element={<Suppliers suppliers={suppliers} />} />
            <Route path="invoices" element={<InvoiceBilling orders={orders} />} />
            <Route path="settings" element={<EDISettings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

const PlaceholderModule = ({ title }) => (
  <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
      <SettingsIcon className="w-10 h-10" />
    </div>
    <h2 className="text-2xl font-bold text-navy-900 font-heading">{title} Module</h2>
    <p className="text-gray-500 max-w-sm">This module is part of the Hiraya platform. Functional implementation for {title} coming soon.</p>
  </div>
);

export default DashboardPage;
