import React from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  LabelList,
  Legend
} from "recharts";
import { Layers, Package, Truck, AlertTriangle, ArrowUpRight, ArrowDownRight, Factory, TrendingUp, PhilippinePeso, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/Common";

const FABRIC_TYPES = ["Cotton", "Polyester", "Linen", "Silk", "Denim", "Wool", "Rayon", "Spandex"];
const FABRIC_COLORS = ["White", "Black", "Blue", "Yellow", "Red", "Pastel", "Khaki", "Navy"];
const TEXTURES = ["Smooth", "Rough", "Matte", "Glossy", "Stretchable", "Heavyweight", "Lightweight", "Breathable Mesh"];
const CHART_COLORS = ["#10B981", "#F59E0B", "#EF4444", "#1B4FFF", "#8B5CF6", "#EC4899"];

// Gross margin assumption per fabric type (% of revenue kept as profit)
const MARGIN_BY_TYPE = {
  cotton: 0.32, denim: 0.28, polyester: 0.35, linen: 0.30,
  silk: 0.40, canvas: 0.33, satin: 0.38, wool: 0.36, default: 0.30,
};

function calcOrderRevenue(order) {
  if (order.totalAmount) return Number(order.totalAmount);
  const items = order.items || [];
  if (items.length > 0)
    return items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 750), 0);
  return (Number(order.quantity) || 0) * 750;
}

function calcOrderProfit(order) {
  const items = order.items && order.items.length > 0
    ? order.items
    : [{ fabricType: order.fabricType, quantity: order.quantity, unitPrice: order.unitPrice || 750 }];
  return items.reduce((s, i) => {
    const typeKey = (i.fabricType || "default").toLowerCase();
    const margin  = MARGIN_BY_TYPE[typeKey] || MARGIN_BY_TYPE.default;
    return s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 750) * margin;
  }, 0);
}

export const Overview = ({ fabrics, activities, orders, suppliers }) => {
  const allCombinations = React.useMemo(() => {
    if (!fabrics) return [];
    return fabrics.map(f => {
      const quantity = f.quantity !== undefined ? Number(f.quantity) : 0;
      const reorderLevel = f.reorderLevel || 15;
      let status = "Available";
      if (quantity === 0) status = "Critical";
      else if (quantity <= reorderLevel) status = "Low Stock";

      return {
        id: f.id,
        type: f.type || "Other",
        color: f.color || "N/A",
        texture: f.texture || "N/A",
        quantity: quantity,
        rollLength: f.rollLength || 100,
        reorderLevel: reorderLevel,
        status: status
      };
    });
  }, [fabrics]);

  const totalMeters = allCombinations.reduce((acc, f) => acc + (f.quantity * f.rollLength), 0);
  const lowStock = allCombinations.filter(f => f.status === "Low Stock").length;
  const criticalStock = allCombinations.filter(f => f.status === "Critical").length;

  const stockByType = allCombinations.reduce((acc, f) => {
    const existing = acc.find(item => item.name === f.type);
    if (existing) {
      existing.value += f.quantity * f.rollLength;
    } else {
      acc.push({ name: f.type, value: f.quantity * f.rollLength });
    }
    return acc;
  }, []);

  const statusDistribution = [
    { name: "Available", value: allCombinations.filter(f => f.status === "Available").length },
    { name: "Low Stock", value: lowStock },
    { name: "Critical", value: criticalStock },
  ];

  const activeOrders = orders.filter(o => {
    if (typeof o.workflowStep === 'number') {
      return o.workflowStep < 3 && o.declined !== true;
    }
    return o.status !== "Completed" && o.declined !== true;
  }).length;

  const activeManufacturers = React.useMemo(() => {
    const names = orders.map(o => o.customer || "Vogue Manufacturing");
    return new Set(names).size;
  }, [orders]);

  // ── Revenue & Profit ────────────────────────────────────────────────────────
  const completedOrders = orders.filter(o => !o.declined && o.paymentStatus === "Paid");
  const totalRevenue = completedOrders.reduce((s, o) => s + calcOrderRevenue(o), 0);
  const totalProfit  = completedOrders.reduce((s, o) => s + calcOrderProfit(o), 0);

  // ── Top Sales ───────────────────────────────────────────────────────────────
  const topSales = React.useMemo(() => {
    const map = {};
    orders.filter(o => !o.declined).forEach(order => {
      const items = order.items && order.items.length > 0
        ? order.items
        : [{ fabricType: order.fabricType, color: order.color, quantity: order.quantity, unitPrice: order.unitPrice || 750 }];
      items.forEach(item => {
        if (!item.fabricType) return;
        const key = `${item.fabricType}${item.color ? ` · ${item.color}` : ""}`;
        if (!map[key]) map[key] = { name: key, revenue: 0, qty: 0 };
        map[key].revenue += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 750);
        map[key].qty     += Number(item.quantity) || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [orders]);

  const statCards = [
    {
      label: "Total Revenue",
      value: `₱${totalRevenue >= 1_000_000 ? (totalRevenue / 1_000_000).toFixed(2) + "M" : totalRevenue.toLocaleString()}`,
      sub: "Paid orders",
      icon: PhilippinePeso,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
    },
    {
      label: "Gross Profit",
      value: `₱${totalProfit >= 1_000_000 ? (totalProfit / 1_000_000).toFixed(2) + "M" : Math.round(totalProfit).toLocaleString()}`,
      sub: `${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin`,
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
    {
      label: "Low Stock Items",
      value: lowStock,
      sub: "Warning",
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-white",
      border: "border-slate-100",
    },
    {
      label: "Active Manufacturers",
      value: activeManufacturers,
      sub: "Network",
      icon: Factory,
      color: "text-slate-900",
      bg: "bg-white",
      border: "border-slate-100",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <div key={i} className={cn("geometric-card p-6 flex flex-col border", stat.bg, stat.border)}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{stat.label}</p>
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", i < 2 ? stat.bg : "bg-slate-50")}>
                <stat.icon className={cn("w-4 h-4", stat.color)} />
              </div>
            </div>
            <div className="flex items-end gap-2 mt-auto">
              <h2 className={cn("text-3xl font-extrabold font-heading tracking-tight", stat.color)}>{stat.value}</h2>
              {stat.sub && <span className="text-slate-400 text-xs font-medium uppercase tracking-tight pb-1">{stat.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fabric Stock by Type */}
        <div className="lg:col-span-2 geometric-card p-8 bg-white">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-900 font-heading text-lg">Inventory Distribution</h3>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <span className="w-2 h-2 rounded-full bg-primary" /> Stock Volume (m)
              </div>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockByType}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#94a3b8" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "#94a3b8" }} />
                <Tooltip 
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{ 
                    borderRadius: "16px", 
                    border: "none", 
                    boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.05)"
                  }}
                  formatter={(value) => [`${value.toLocaleString()}m`, "Total Volume"]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                  {stockByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                  <LabelList dataKey="value" position="top" style={{ fill: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }} formatter={(val) => val > 1000 ? `${(val/1000).toFixed(1)}k` : val} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock Status Distribution */}
        <div className="geometric-card p-8 bg-white">
          <h3 className="font-bold text-slate-900 font-heading text-lg mb-8">Status Health</h3>
          <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900">{allCombinations.length}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total SKUs</span>
            </div>
          </div>
          <div className="space-y-4 mt-6">
            {statusDistribution.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-slate-500 text-sm font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        {/* Top Sales */}
        <div className="geometric-card p-8 bg-white">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-900 font-heading text-lg">Top Sales</h3>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-wider">By Revenue</span>
          </div>
          {topSales.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-300">
              <TrendingUp className="w-10 h-10 mb-3" />
              <p className="text-xs font-black uppercase tracking-widest">No sales data yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topSales.map((item, i) => {
                const maxRevenue = topSales[0].revenue;
                const pct = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                const colors = ["#1B4FFF", "#4F46E5", "#6366F1", "#818CF8", "#A5B4FC"];
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 w-4">{i + 1}</span>
                        <span className="text-sm font-black text-slate-800">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-slate-900">
                          ₱{item.revenue >= 1_000_000
                            ? (item.revenue / 1_000_000).toFixed(2) + "M"
                            : item.revenue >= 1_000
                            ? (item.revenue / 1_000).toFixed(1) + "K"
                            : item.revenue.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium ml-1.5">{item.qty.toLocaleString()} units</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: colors[i] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* All Transactions — live from orders */}
        <div className="geometric-card bg-white">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 font-heading text-lg">All Transactions</h3>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg uppercase tracking-widest">
              {orders.filter(o => !o.declined).length} orders
            </span>
          </div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="p-10 text-center">
                <Package className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No transactions yet</p>
              </div>
            ) : [...orders]
              .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
              .map((order) => {
                const isDeclined  = order.declined === true;
                const isComplete  = order.workflowStep >= 7;
                const isPaid      = order.paymentStatus === "Paid";
                const statusColor = isDeclined  ? "bg-red-50 text-red-600 border-red-100"
                                  : isComplete  ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                  : "bg-blue-50 text-blue-600 border-blue-100";
                const iconColor   = isDeclined  ? "text-red-500"
                                  : isComplete  ? "text-emerald-500"
                                  : "text-blue-500";
                const label       = isDeclined  ? "Declined"
                                  : isComplete  ? "Fulfilled"
                                  : order.status || "In Progress";
                const material    = order.items?.length > 0
                  ? `${order.items[0].fabricType || "—"} · ${order.items[0].color || ""}`
                  : `${order.fabricType || "—"} · ${order.color || ""}`;
                const total = order.totalAmount
                  ? `₱${Number(order.totalAmount).toLocaleString()}`
                  : order.items?.length > 0
                  ? `₱${order.items.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 750), 0).toLocaleString()}`
                  : "—";
                const date = new Date(order.createdAt || order.updatedAt || order.orderDate || Date.now());

                return (
                  <div key={order.id} className="p-4 px-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border flex-shrink-0", statusColor)}>
                        {isDeclined ? <AlertTriangle className={cn("w-4 h-4", iconColor)} />
                          : isComplete ? <CheckCircle2 className={cn("w-4 h-4", iconColor)} />
                          : <Package className={cn("w-4 h-4", iconColor)} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">{order.poNumber || order.id}</span>
                          {isPaid && (
                            <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-md">Paid</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                          {material} · {date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-black text-slate-900">{total}</div>
                      <div className={cn("text-[9px] font-black uppercase tracking-widest mt-0.5",
                        isDeclined ? "text-red-400" : isComplete ? "text-emerald-500" : "text-blue-400")}>
                        {label}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};
