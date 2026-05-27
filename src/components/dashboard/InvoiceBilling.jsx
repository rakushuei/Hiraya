import React, { useState, useEffect, useRef } from "react";
import {
  FileText, Search, CheckCircle2, Clock, AlertCircle,
  CreditCard, X, ChevronDown, Filter, DollarSign, Package, Truck, Download, Send
} from "lucide-react";
import { Button } from "../ui/Common";
import { cn } from "../../lib/utils";
import { rtdb } from "../../lib/firebase";
import { ref, update, onValue } from "firebase/database";
import { Invoice } from "./Invoice";

// Orders at step 5+ can have an invoice (861 received, ready for 810)
const INVOICE_MIN_STEP = 5;

function paymentBadge(status) {
  if (status === "Paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-red-50 text-red-600 border-red-200";
}

function paymentIcon(status) {
  if (status === "Paid") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
}

function calcTotal(order) {
  if (order.totalAmount) return Number(order.totalAmount);
  const items = order.items || [];
  if (items.length > 0) return items.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 750), 0);
  return (order.quantity || 0) * 750;
}

function PaymentModal({ order, onClose, onSave }) {
  // Kept as stub — payment now comes exclusively via EDI 820 from manufacturer
  return null;
}

// ─── Freight Invoice helpers ──────────────────────────────────────────────────
function freightBadge(status) {
  if (status === "Paid")    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Partial") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-600 border-red-200";
}

function FreightInvoiceTab() {
  const [freightInvoices, setFreightInvoices] = useState([]);
  const [searchTerm, setSearchTerm]           = useState("");
  const [filterStatus, setFilterStatus]       = useState("all");
  const [paying, setPaying]                   = useState(null); // invoiceId being paid

  // Listen to freightInvoices node in RTDB
  useEffect(() => {
    const dbRef = ref(rtdb, "freightInvoices");
    const unsub = onValue(dbRef, snap => {
      const data = snap.val();
      if (!data) return setFreightInvoices([]);
      setFreightInvoices(
        Object.entries(data).map(([id, v]) => ({ id, ...v }))
          .sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0))
      );
    });
    return () => unsub();
  }, []);

  const handleMarkPaid = async (inv) => {
    setPaying(inv.id);
    try {
      // 1. Notify logistics that we've paid
      await fetch("https://grip-faceplate-alienate.ngrok-free.dev/api/invoices/webhook/paid", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ shipmentId: inv.shipmentId, paymentStatus: "PAID" }),
      }).catch(() => {}); // fire-and-forget — don't block on logistics response
      // 2. Update our own RTDB record
      await update(ref(rtdb, `freightInvoices/${inv.id}`), {
        status:    "Paid",
        paidAt:    new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[FreightInvoice] Mark paid error:", e);
    } finally {
      setPaying(null);
    }
  };

  const filtered = freightInvoices.filter(inv => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      (inv.invoiceId  || "").toLowerCase().includes(term) ||
      (inv.shipmentId || "").toLowerCase().includes(term);
    const matchFilter = filterStatus === "all" || (inv.status || "Pending") === filterStatus;
    return matchSearch && matchFilter;
  });

  const counts = {
    all:     freightInvoices.length,
    Pending: freightInvoices.filter(i => (i.status || "Pending") === "Pending").length,
    Paid:    freightInvoices.filter(i => i.status === "Paid").length,
  };

  const totalAmount  = freightInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const totalPending = freightInvoices.filter(i => (i.status || "Pending") !== "Paid")
    .reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const totalPaid    = freightInvoices.filter(i => i.status === "Paid")
    .reduce((s, i) => s + Number(i.totalAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Invoices",  value: freightInvoices.length,              color: "text-slate-700",   bg: "bg-slate-50 border-slate-200",     icon: Truck },
          { label: "Paid",           value: `₱${totalPaid.toLocaleString()}`,    color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", icon: CheckCircle2 },
          { label: "Unpaid",         value: `₱${totalPending.toLocaleString()}`, color: "text-red-600",     bg: "bg-red-50 border-red-100",         icon: AlertCircle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-2xl p-5 border flex items-center gap-4", bg)}>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-white border", bg)}>
              <Icon className={cn("w-5 h-5", color)} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
              <p className={cn("text-xl font-black", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="geometric-card">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 flex-wrap gap-1">
            {[
              { key: "all",     label: "All" },
              { key: "Pending", label: "Pending" },
              { key: "Paid",    label: "Paid" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                  filterStatus === key
                    ? key === "Paid"    ? "bg-emerald-600 text-white shadow-lg"
                    : key === "Pending" ? "bg-amber-500 text-white shadow-lg"
                    :                    "bg-slate-900 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-md text-[8px]",
                  filterStatus === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {counts[key] ?? counts["all"]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by invoice ID or shipment ID..."
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
                <th className="px-6 py-4">Invoice ID</th>
                <th className="px-6 py-4">Shipment ID</th>
                <th className="px-6 py-4 text-right">Total Amount</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Received At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Truck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                      {freightInvoices.length === 0
                        ? "No freight invoices received yet"
                        : "No invoices match your filter"}
                    </p>
                  </td>
                </tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-black text-slate-900">{inv.invoiceId || inv.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-bold text-slate-700">{inv.shipmentId || "—"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-black text-slate-900">
                    ₱{Number(inv.totalAmount || 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    {inv.dueDate ? (
                      <div className="flex flex-col">
                        <span className={cn(
                          "text-sm font-black",
                          new Date(inv.dueDate) < new Date() && inv.status !== "Paid"
                            ? "text-red-600"
                            : "text-slate-900"
                        )}>
                          {new Date(inv.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {new Date(inv.dueDate) < new Date() && inv.status !== "Paid" && (
                          <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Overdue</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                      freightBadge(inv.status || "Pending")
                    )}>
                      {inv.status === "Paid"
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                      {inv.status || "Pending"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {inv.receivedAt ? new Date(inv.receivedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {(inv.status || "Pending") !== "Paid" ? (
                      <Button
                        size="sm"
                        className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        disabled={paying === inv.id}
                        onClick={() => handleMarkPaid(inv)}
                      >
                        {paying === inv.id
                          ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <CreditCard className="w-3.5 h-3.5" />}
                        Mark Paid
                      </Button>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {inv.pdfUrl && (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[10px] font-black tracking-widest border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> Receipt
                          </a>
                        )}
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const InvoiceBilling = ({ orders = [] }) => {
  const [activeTab, setActiveTab]           = useState("sales");
  const [searchTerm, setSearchTerm]         = useState("");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [refresh, setRefresh]               = useState(0);
  const [sending997, setSending997]         = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null); // order to show invoice for

  const handleSend997 = async (order) => {
    setSending997(order.id);
    try {
      const invoiceNumber  = `INV-${(order.poNumber || order.id).replace(/[^0-9]/g, "")}`;
      const totalAmount    = calcTotal(order);
      const acknowledgedAt = new Date().toISOString();

      // EDI 997 — Functional Acknowledgement of the manufacturer's EDI 820 payment
      const payload997 = {
        orderId:       order.id,
        poNumber:      order.poNumber || order.id,
        invoiceNumber,
        totalAmount:   order.edi820?.paymentAmount || totalAmount,
        paymentStatus: "Paid",
        acknowledgedAt,
      };

      await fetch("/api/edi/proxy-manufacturer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "receive-997", body: payload997 }),
      }).catch(() => {}); // fire-and-forget via server proxy (avoids CORS)

      // Mark 997 sent on the order and advance to step 8
      await update(ref(rtdb, `orders/${order.id}`), {
        edi997Sent:    true,
        edi997SentAt:  acknowledgedAt,
        edi997Payload: payload997,
        workflowStep:  8,
        status:        "Receipt Sent (997)",
        updatedAt:     acknowledgedAt,
      });
    } catch (e) {
      console.error("[997]", e);
    } finally {
      setSending997(null);
    }
  };

  const invoiceOrders = orders.filter(o => !o.declined && o.workflowStep >= INVOICE_MIN_STEP);

  const filtered = invoiceOrders.filter(o => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      (o.id || "").toLowerCase().includes(term) ||
      (o.poNumber || "").toLowerCase().includes(term) ||
      (o.customer || "").toLowerCase().includes(term);
    const status = o.paymentStatus || "Not Paid";
    const matchFilter = filterStatus === "all" || status === filterStatus;
    return matchSearch && matchFilter;
  });

  const counts = {
    all:        invoiceOrders.length,
    "Paid":     invoiceOrders.filter(o => o.paymentStatus === "Paid").length,
    "Not Paid": invoiceOrders.filter(o => !o.paymentStatus || o.paymentStatus === "Not Paid").length,
  };

  const totalRevenue  = invoiceOrders.filter(o => o.paymentStatus === "Paid").reduce((s, o) => s + calcTotal(o), 0);
  const totalPending  = invoiceOrders.filter(o => o.paymentStatus !== "Paid").reduce((s, o) => s + (calcTotal(o) - Number(o.amountPaid || 0)), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 font-heading tracking-tight uppercase">Invoice Billing</h2>
          <p className="text-slate-500 text-sm font-medium tracking-tight">EDI 810 payment tracking — full & unpaid</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit">
        <button
          onClick={() => setActiveTab("sales")}
          className={cn(
            "px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
            activeTab === "sales" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <FileText className="w-3.5 h-3.5" /> Sales Invoices
        </button>
        <button
          onClick={() => setActiveTab("freight")}
          className={cn(
            "px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
            activeTab === "freight" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <Truck className="w-3.5 h-3.5" /> Freight Invoices
        </button>
      </div>

      {activeTab === "freight" ? (
        <FreightInvoiceTab />
      ) : (
        <>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Collected", value: `₱${totalRevenue.toLocaleString()}`, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", icon: CheckCircle2 },
          { label: "Unpaid",          value: `₱${totalPending.toLocaleString()}`, color: "text-red-600",     bg: "bg-red-50 border-red-100",         icon: AlertCircle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-2xl p-5 border flex items-center gap-4", bg)}>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-white border", bg)}>
              <Icon className={cn("w-5 h-5", color)} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
              <p className={cn("text-xl font-black", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="geometric-card">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 flex-wrap gap-1">
            {[
              { key: "all",       label: "All" },
              { key: "Not Paid",  label: "Not Paid" },
              { key: "Paid",      label: "Paid" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                  filterStatus === key
                    ? key === "Paid"     ? "bg-emerald-600 text-white shadow-lg"
                    : key === "Not Paid" ? "bg-red-600 text-white shadow-lg"
                    :                     "bg-slate-900 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-md text-[8px]",
                  filterStatus === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {counts[key] ?? counts["all"]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by order, PO, customer..."
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
                <th className="px-6 py-4">Invoice / Order</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Materials</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Paid</th>
                <th className="px-6 py-4 text-right">Balance</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                      {invoiceOrders.length === 0 ? "No invoices yet — orders reach this stage after delivery" : "No invoices match your filter"}
                    </p>
                  </td>
                </tr>
              ) : filtered.map(order => {
                const total   = calcTotal(order);
                const paid    = Number(order.amountPaid || 0);
                const balance = total - paid;
                const status  = order.paymentStatus || "Not Paid";
                const invoiceNo = `INV-${(order.poNumber || order.id).replace(/[^0-9]/g, "")}`;
                const material = order.items?.length > 1
                  ? `${order.items[0].fabricType} +${order.items.length - 1} more`
                  : `${order.fabricType || order.items?.[0]?.fabricType || "—"}`;

                return (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-900">{invoiceNo}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">{order.id}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-700">{order.customer || "Vogue Manufacturing"}</span>
                      {order.poNumber && <div className="text-[10px] text-slate-400 font-bold uppercase">Ref: {order.poNumber}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">{material}</td>
                    <td className="px-6 py-4 text-right font-black text-slate-900">₱{total.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-black text-emerald-600">₱{paid.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-black text-red-500">₱{balance.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                        paymentBadge(status)
                      )}>
                        {paymentIcon(status)}
                        {status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {status !== "Paid" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 border border-amber-100">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          Awaiting EDI 820
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {/* View Invoice */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg border-slate-200 hover:border-blue-400 hover:text-blue-600 gap-1.5"
                            onClick={() => setViewingInvoice(order)}
                          >
                            <FileText className="w-3.5 h-3.5" /> View Invoice
                          </Button>
                          {/* Send 997 Functional Acknowledgement */}
                          {!order.edi997Sent ? (
                            <Button
                              size="sm"
                              className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                              disabled={sending997 === order.id}
                              onClick={() => handleSend997(order)}
                            >
                              {sending997 === order.id
                                ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <Send className="w-3.5 h-3.5" />}
                              Send 997
                            </Button>
                          ) : (
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 997 Sent
                            </span>
                          )}
                          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice viewer modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">EDI 810 Invoice</p>
                <h3 className="text-lg font-black text-slate-900">
                  INV-{(viewingInvoice.poNumber || viewingInvoice.id).replace(/[^0-9]/g, "")}
                </h3>
              </div>
              <button
                onClick={() => setViewingInvoice(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            {/* Scrollable invoice content */}
            <div className="overflow-y-auto flex-1">
              <Invoice order={viewingInvoice} />
            </div>
          </div>
        </div>
      )}
      </> /* end sales tab */
      )} {/* end activeTab conditional */}
    </div>
  );
};
