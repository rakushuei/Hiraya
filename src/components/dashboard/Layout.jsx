import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Home, 
  Layers, 
  Package, 
  Truck, 
  Users, 
  Settings, 
  LogOut,
  Bell,
  Search,
  User,
  ChevronDown,
  Zap,
  Receipt
} from "lucide-react";
import { cn } from "../../lib/utils";
import { auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";

const buildSidebarItems = (pendingCount = 0) => [
  { type: "label", name: "Analytics & Overview" },
  { type: "item", name: "Dashboard",          path: "/dashboard",            icon: Home },
  { type: "item", name: "Raw Material Stock", path: "/dashboard/inventory",  icon: Layers },
  { type: "label", name: "Operations" },
  { type: "item", name: "Purchase Orders",    path: "/dashboard/orders",     icon: Package, badge: pendingCount },
  { type: "item", name: "EDI Monitor",        path: "/dashboard/edi",        icon: Zap },
  { type: "item", name: "Shipments",          path: "/dashboard/shipments",  icon: Truck },
  { type: "item", name: "Invoice Billing",    path: "/dashboard/invoices",   icon: Receipt },
  { type: "label", name: "System" },
  { type: "item", name: "Settings",           path: "/dashboard/settings",   icon: Settings },
];

export const Sidebar = ({ user, pendingOrderCount = 0 }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const sidebarItems = buildSidebarItems(pendingOrderCount);

  const handleLogout = async () => {
    localStorage.removeItem("mock_auth");
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout error:", e);
    }
    navigate("/");
  };

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isHovered ? 256 : 80 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="bg-navy text-slate-300 flex flex-col h-screen sticky top-0 shrink-0 border-r border-slate-800 z-50 overflow-hidden"
    >
      <div className="p-6 flex items-center gap-3 h-20 shrink-0">
        <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/5 rounded-xl border border-white/10 p-1">
          <img 
            src="/logo.png" 
            alt="Hiraya" 
            className="w-full h-full object-contain" 
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          <Layers className="w-6 h-6 text-primary" style={{ display: 'none' }} />
        </div>
        <AnimatePresence>
          {isHovered && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="text-xl font-bold text-white font-heading tracking-tight uppercase whitespace-nowrap"
            >
              Hiraya
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-0.5 overflow-y-auto">
        {sidebarItems.map((item, idx) => {
          if (item.type === "label") {
            return (
              <AnimatePresence key={`label-${idx}`}>
                {isHovered && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-3 pt-5 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap"
                  >
                    {item.name}
                  </motion.p>
                )}
                {!isHovered && <div className="h-4" />}
              </AnimatePresence>
            );
          }

          const isActive = item.path === "/dashboard"
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          const hasBadge = item.badge > 0;

          return (
            <Link
              key={item.name}
              to={item.path}
              className={cn(
                "flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group overflow-hidden whitespace-nowrap",
                isActive
                  ? "bg-primary text-white shadow-lg shadow-primary/10"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <div className="shrink-0 relative">
                <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-white" : "text-slate-500")} />
                {hasBadge && !isHovered && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black text-white flex items-center justify-center border-2 border-navy">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </div>
              <AnimatePresence>
                {isHovered && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="flex-1 flex items-center justify-between"
                  >
                    {item.name}
                    {hasBadge && (
                      <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-black rounded-full">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 mt-auto">
        <div className="h-px bg-slate-800 mb-2 mx-3" />
        <div className="px-3 py-4 min-h-[72px] flex items-center">
          <AnimatePresence mode="wait">
            {!isHovered ? (
              <motion.div 
                key="collapsed"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="w-full flex justify-center"
              >
                <button 
                  onClick={handleLogout}
                  className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 hover:text-red-400 border border-slate-700 transition-colors shadow-inner group"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5 transition-transform group-active:scale-90" />
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between w-full overflow-hidden whitespace-nowrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700 shrink-0 uppercase font-bold text-xs shadow-inner">
                    {user?.email?.charAt(0) || <User className="w-5 h-5" />}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-sm font-bold text-white truncate">{user?.displayName || "Admin User"}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-tighter truncate">{user?.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <div className="h-8 w-px bg-slate-800" />
                  <button 
                    onClick={handleLogout}
                    className="p-2 text-slate-500 hover:text-red-400 transition-all hover:bg-white/5 rounded-lg group"
                    title="Sign Out"
                  >
                    <LogOut className="w-6 h-6 transition-transform group-active:scale-90" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
};

export const DashboardTopbar = () => {
  return (
    <header className="h-16 border-b border-slate-100 bg-white/80 backdrop-blur-md px-8 flex items-center justify-end sticky top-0 z-40">
    </header>
  );
};
