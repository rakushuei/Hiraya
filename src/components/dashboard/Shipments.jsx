import React, { useState, useEffect } from "react";
import {
  Truck, Search, Package, CheckCircle2, Clock,
  Zap, FileText, X, CreditCard, AlertCircle, DollarSign, Download, XCircle
} from "lucide-react";
import { Button } from "../ui/Common";
import { cn } from "../../lib/utils";
import { rtdb } from "../../lib/firebase";
import { ref, onValue } from "firebase/database";

// Orders at step 2+ have entered the logistics pipeline
const LOGISTICS_MIN_STEP = 2;

const TRANSIT_STEPS = [
  { key: "Pending",    label: "Pending",    icon: Clock },
  { key: "Pickup",     label: "Pickup",     icon: Package },
  { key: "In Transit", label: "In Transit", icon: Truck },
  { key: "Delivered",  label: "Delivered",  icon: CheckCircle2 },
];

function transitBadgeVariant(status) {
  if (!status || status === "Pending") return "warning";
  if (status === "Pickup")             return "default";
  if (status === "In Transit")         return "default";
  if (status === "Delivered")          return "success";
  return "default";
}

function transitBadgeColor(status) {
  if (!status || status === "Pending") return "bg-amber-50 text-amber-700 border-amber-100";
  if (status === "Pickup")             return "bg-blue-50 text-blue-700 border-blue-100";
  if (status === "In Transit")         return "bg-blue-50 text-blue-700 border-blue-100";
  if (status === "Delivered")          return "bg-emerald-50 text-emerald-700 border-emerald-100";
  return "bg-slate-50 text-slate-700 border-slate-100";
}

function workflowLabel(step) {
  const labels = {
    2: "990 Accepted",
    3: "Shipment Dispatched",
    4: "In Transit (214)",
    5: "Receiving Advice (861)",
    6: "Invoice (810)",
    7: "Fulfilled",
  };
  return labels[step] || `Step ${step}`;
}

// ─── Freight Invoice Modal ────────────────────────────────────────────────────
function FreightInvoiceModal({ invoice, onClose }) {
  const isPaid = invoice.status === "Paid";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Freight Invoice</p>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              {invoice.invoiceId || invoice.id}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status banner */}
          <div className={cn(
            "rounded-2xl p-4 flex items-center gap-3 border",
            isPaid ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
          )}>
            {isPaid
              ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              : <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />}
            <div>
              <p className={cn("text-xs font-black uppercase tracking-widest", isPaid ? "text-emerald-700" : "text-amber-700")}>
                {invoice.status || "Pending"}
              </p>
              {isPaid && invoice.paidAt && (
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  Paid on {new Date(invoice.paidAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Invoice details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Invoice ID",   value: invoice.invoiceId || invoice.id },
              { label: "Shipment ID",  value: invoice.shipmentId || "—" },
              { label: "Total Amount", value: `₱${Number(invoice.totalAmount || 0).toLocaleString()}` },
              { label: "Received At",  value: invoice.receivedAt ? new Date(invoice.receivedAt).toLocaleString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                <p className="text-xs font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {/* Carrier info */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center gap-3">
            <Truck className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrier</p>
              <p className="text-sm font-black text-slate-900">CarGo · LTL</p>
            </div>
          </div>

          {/* PDF Receipt — shown once logistics sends it after payment */}
          {invoice.pdfUrl && (
            <a
              href={invoice.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full p-4 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
                  <FileText className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Payment Receipt</p>
                  <p className="text-[10px] text-emerald-500 font-medium mt-0.5">Issued by CarGo Logistics</p>
                </div>
              </div>
              <Download className="w-4 h-4 text-emerald-500 group-hover:text-emerald-700 transition-colors" />
            </a>
          )}
        </div>

        <div className="p-6 pt-0">
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ order, onClose }) {
  const transitIndex = TRANSIT_STEPS.findIndex(
    s => s.key === (order.transitStatus || "Pending")
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Shipment Detail</p>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              {order.carrierShipmentId || order.shipmentId || "—"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Transit stepper */}
          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transit Progress</p>
            <div className="flex items-center justify-between relative">
              <div className="absolute top-5 left-5 right-5 h-[2px] bg-slate-700 -z-10" />
              {/* filled line */}
              <div
                className="absolute top-5 left-5 h-[2px] bg-emerald-500 transition-all duration-500 -z-10"
                style={{ width: transitIndex <= 0 ? "0%" : `${(transitIndex / (TRANSIT_STEPS.length - 1)) * 100}%` }}
              />
              {TRANSIT_STEPS.map((step, idx) => {
                const Icon = step.icon;
                const done = idx < transitIndex;
                const active = idx === transitIndex;
                return (
                  <div key={step.key} className="flex flex-col items-center gap-2">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                      done   ? "bg-emerald-500 border-emerald-500 text-white" :
                      active ? "bg-white border-blue-500 text-blue-600 scale-110 shadow-lg" :
                               "bg-slate-800 border-slate-700 text-slate-500"
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-wider text-center w-14",
                      done ? "text-emerald-400" : active ? "text-white" : "text-slate-500"
                    )}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Order ID",        value: order.id },
              { label: "PO Reference",    value: order.poNumber || "—" },
              { label: "Carrier",         value: "CarGo" },
              { label: "Service",         value: "LTL" },
              { label: "Vehicle",         value: typeof order.assignedVehicle === "object"
                  ? `${order.assignedVehicle?.name || "—"}${order.assignedVehicle?.plate ? ` · ${order.assignedVehicle.plate}` : ""}`
                  : order.assignedVehicle || "—" },
              { label: "Shipment ID",          value: order.carrierShipmentId || order.shipmentId || "—" },
              { label: "Accepted At",           value: order.carrierAcceptedAt ? new Date(order.carrierAcceptedAt).toLocaleString() : "—" },
              { label: "Arrived At Destination", value: order.carrierDeliveredAt ? new Date(order.carrierDeliveredAt).toLocaleString() : "—" },
              { label: "Delivery Location",     value: order.currentLocation || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                <p className="text-xs font-black text-slate-900 truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Materials */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Materials</p>
            <div className="space-y-2">
              {(order.items || [{
                fabricType: order.fabricType,
                color: order.color,
                texture: order.texture,
                quantity: order.quantity,
                unit: order.unit || "Yards"
              }]).map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-sm font-black text-slate-900">{item.fabricType || item.productName || "—"}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{item.color} • {item.texture}</p>
                  </div>
                  <p className="text-sm font-black text-emerald-600">{item.quantity} {item.unit || "Yds"}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Carrier rejection banner */}
          {order.status === "Carrier Rejected (990)" && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-xs font-black text-red-700 uppercase tracking-widest">Load Tender Rejected by CarGo</p>
              </div>
              <p className="text-xs text-red-600 font-medium leading-relaxed">
                {order.declineReason || order.carrierRejectedReason || "No reason provided by carrier."}
              </p>
              {order.carrierRejectedAt && (
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                  Rejected at {new Date(order.carrierRejectedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {order.lastDescription && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Last Update</p>
              <p className="text-xs text-blue-700 font-medium">{order.lastDescription}</p>
            </div>
          )}
        </div>

        <div className="p-6 pt-0">
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export const Shipments = ({ orders = [], shipments = [] }) => {
  const [searchTerm, setSearchTerm]           = useState("");
  const [activeTab, setActiveTab]             = useState("active");
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [freightInvoices, setFreightInvoices] = useState({}); // keyed by shipmentId

  // Load freight invoices from RTDB and index by shipmentId for O(1) lookup
  useEffect(() => {
    const dbRef = ref(rtdb, "freightInvoices");
    const unsub = onValue(dbRef, snap => {
      const data = snap.val();
      if (!data) return setFreightInvoices({});
      const byShipment = {};
      Object.entries(data).forEach(([id, inv]) => {
        if (inv.shipmentId) byShipment[inv.shipmentId] = { id, ...inv };
      });
      setFreightInvoices(byShipment);
    });
    return () => unsub();
  }, []);

  // Only orders that have entered the logistics pipeline (990 accepted = step 2+)
  const logisticsOrders = orders.filter(o =>
    !o.declined && o.workflowStep >= LOGISTICS_MIN_STEP
  );

  // Carrier-rejected orders (990 rejection from CarGo)
  const rejectedOrders  = logisticsOrders.filter(o => o.status === "Carrier Rejected (990)");
  const nonRejected     = logisticsOrders.filter(o => o.status !== "Carrier Rejected (990)");

  const activeOrders    = nonRejected.filter(o => o.transitStatus !== "Delivered" && o.workflowStep < 5);
  const deliveredOrders = nonRejected.filter(o => o.transitStatus === "Delivered" || o.workflowStep >= 5);

  const tabOrders = activeTab === "active"    ? activeOrders
                  : activeTab === "delivered" ? deliveredOrders
                  : rejectedOrders;

  const filtered = tabOrders.filter(o => {
    const term = searchTerm.toLowerCase();
    return (
      (o.carrierShipmentId || o.shipmentId || "").toLowerCase().includes(term) ||
      (o.id || "").toLowerCase().includes(term) ||
      (o.poNumber || "").toLowerCase().includes(term) ||
      (o.customer || "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 font-heading tracking-tight uppercase">
            Logistics Shipments
          </h2>
          <p className="text-slate-500 text-sm font-medium tracking-tight">
            CarGo carrier tracking — EDI 990 / 214 pipeline
          </p>
        </div>
      </div>

      <div className="geometric-card">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          {/* Tabs */}
          <div className="flex bg-white p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab("active")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "active"
                  ? "bg-slate-900 text-white shadow-lg"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Truck className={cn("w-3.5 h-3.5", activeTab === "active" ? "text-blue-400" : "text-slate-300")} />
              Active
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "active" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {activeOrders.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("delivered")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "delivered"
                  ? "bg-emerald-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <CheckCircle2 className={cn("w-3.5 h-3.5", activeTab === "delivered" ? "text-white" : "text-slate-300")} />
              Delivered
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "delivered" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {deliveredOrders.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "rejected"
                  ? "bg-red-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <XCircle className={cn("w-3.5 h-3.5", activeTab === "rejected" ? "text-white" : "text-slate-300")} />
              Rejected
              {rejectedOrders.length > 0 && (
                <span className={cn(
                  "ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                  activeTab === "rejected" ? "bg-white/20 text-white" : "bg-red-100 text-red-600"
                )}>
                  {rejectedOrders.length}
                </span>
              )}
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by shipment ID, order, PO..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Shipment ID</th>
                <th className="px-6 py-4">Order / PO</th>
                <th className="px-6 py-4">Materials</th>
                <th className="px-6 py-4">Vehicle</th>
                <th className="px-6 py-4">Transit Status</th>
                <th className="px-6 py-4">Pipeline Stage</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <Truck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                      {logisticsOrders.length === 0
                        ? "No shipments yet — send a Load Tender (204) to get started"
                        : activeTab === "rejected"
                        ? "No rejected shipments"
                        : "No shipments match your search"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(order => {
                  const shipId = order.carrierShipmentId || order.shipmentId || "—";
                  const transit = order.transitStatus || "Pending";
                  const material = (order.items?.length > 1)
                    ? `${order.items[0]?.fabricType || "—"} +${order.items.length - 1} more`
                    : `${order.fabricType || order.items?.[0]?.fabricType || "—"} • ${order.color || order.items?.[0]?.color || ""}`;

                  return (
                    <tr
                      key={order.id}
                      className={cn(
                        "transition-colors cursor-pointer",
                        order.status === "Carrier Rejected (990)"
                          ? "bg-red-50/60 hover:bg-red-50"
                          : "hover:bg-slate-50/50"
                      )}
                      onClick={() => setSelectedShipment(order)}
                    >
                      {/* Shipment ID */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900">{shipId}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                            CarGo · LTL
                          </span>
                        </div>
                      </td>

                      {/* Order / PO */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900">{order.id}</span>
                          {order.poNumber && (
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                              Ref: {order.poNumber}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Materials */}
                      <td className="px-6 py-4 text-sm font-medium text-slate-600 max-w-[160px] truncate">
                        {material}
                      </td>

                      {/* Vehicle */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="text-sm font-bold text-slate-700">
                            {typeof order.assignedVehicle === "object"
                              ? order.assignedVehicle?.name || order.assignedVehicle?.type || "—"
                              : order.assignedVehicle || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Transit Status */}
                      <td className="px-6 py-4">
                        {order.status === "Carrier Rejected (990)" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-red-50 text-red-600 border-red-200">
                            <XCircle className="w-3.5 h-3.5" /> Rejected by CarGo
                          </span>
                        ) : (
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                            transitBadgeColor(transit)
                          )}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {transit}
                          </span>
                        )}
                      </td>

                      {/* Pipeline Stage */}
                      <td className="px-6 py-4">
                        {order.status === "Carrier Rejected (990)" ? (
                          <div className="flex flex-col gap-1 w-32">
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">
                              990 Rejected
                            </span>
                            <div className="h-1.5 w-full bg-red-100 rounded-full overflow-hidden">
                              <div className="h-full w-1/3 bg-red-400 rounded-full" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 w-32">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                              {workflowLabel(order.workflowStep)}
                            </span>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  order.workflowStep >= 5 ? "bg-emerald-500" : "bg-blue-500"
                                )}
                                style={{ width: order.transitStatus === "Delivered" || order.workflowStep >= 5 ? "100%" : `${Math.min(99, ((order.workflowStep - 1) / 4) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* View Invoice — only shown when a freight invoice exists for this shipment */}
                          {freightInvoices[shipId] && (
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "h-8 text-[10px] font-black tracking-widest px-3 rounded-lg gap-1.5",
                                freightInvoices[shipId].status === "Paid"
                                  ? "border-emerald-200 text-emerald-600 hover:border-emerald-400"
                                  : "border-amber-200 text-amber-600 hover:border-amber-400"
                              )}
                              onClick={e => { e.stopPropagation(); setSelectedInvoice(freightInvoices[shipId]); }}
                            >
                              <FileText className="w-3.5 h-3.5" /> Invoice
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg border-slate-200 hover:border-blue-400 hover:text-blue-600"
                            onClick={e => { e.stopPropagation(); setSelectedShipment(order); }}
                          >
                            View Details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selectedShipment && (
        <DetailModal
          order={selectedShipment}
          onClose={() => setSelectedShipment(null)}
        />
      )}

      {/* Freight Invoice modal */}
      {selectedInvoice && (
        <FreightInvoiceModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}    </div>
  );
};
