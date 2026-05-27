import React, { useState } from "react";
import {
  Zap, Search, CheckCircle2, Package, FileText, CreditCard,
  Truck, XCircle, Clock, ArrowRight, ArrowLeft, X, Code, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "../ui/Common";
import { cn } from "../../lib/utils";
import { getX12POSegments, getX12InvoiceSegments, getX12_855, getX12_204, getX12_990, getX12_214, getX12_861, getX12_820, getX12_997, segmentsToX12String } from "../../lib/ediUtils";

// ── EDI step definitions — mirrors WORKFLOW_STEPS in Orders.jsx (8 steps, 0-7) ──
// workflowStep: 0=855, 1=204, 2=990, 3=856, 4=214, 5=861, 6=810, 7=Fulfillment
// EDI_STEPS[i] = what happened to reach workflowStep i
// 850 is shown as a fixed "received" pre-step before the pipeline starts
const EDI_STEPS = [
  { step: -1, code: "850",  name: "Purchase Order",              dir: "IN",   from: "Manufacturer", to: "Hiraya",       icon: FileText,     color: "blue"    },
  { step: 0,  code: "855",  name: "PO Acknowledgement",          dir: "OUT",  from: "Hiraya",       to: "Manufacturer", icon: CheckCircle2, color: "emerald" },
  { step: 1,  code: "204",  name: "Load Tender",                 dir: "OUT",  from: "Hiraya",       to: "CarGo",        icon: Truck,        color: "orange"  },
  { step: 2,  code: "990",  name: "Tender Accepted",             dir: "IN",   from: "CarGo",        to: "Hiraya",       icon: CheckCircle2, color: "indigo"  },
  { step: 3,  code: "856",  name: "Advance Ship Notice",         dir: "OUT",  from: "Hiraya",       to: "Manufacturer", icon: Package,      color: "violet"  },
  { step: 4,  code: "214",  name: "Transit Status Update",       dir: "IN",   from: "CarGo",        to: "Hiraya",       icon: Truck,        color: "sky"     },
  { step: 5,  code: "861",  name: "Receiving Advice",            dir: "IN",   from: "Manufacturer", to: "Hiraya",       icon: Package,      color: "teal"    },
  { step: 6,  code: "810",  name: "Invoice",                     dir: "OUT",  from: "Hiraya",       to: "Manufacturer", icon: CreditCard,   color: "emerald" },
  { step: 7,  code: "820",  name: "Fulfillment Complete",        dir: "IN",   from: "Manufacturer", to: "Hiraya",       icon: CheckCircle2, color: "emerald" },
  { step: 8,  code: "997",  name: "Functional Acknowledgement",  dir: "OUT",  from: "Hiraya",       to: "Manufacturer", icon: CheckCircle2, color: "emerald" },
];

const DIR_COLORS = {
  IN:  "bg-blue-50 text-blue-600 border-blue-100",
  OUT: "bg-emerald-50 text-emerald-600 border-emerald-100",
  "—": "bg-slate-50 text-slate-500 border-slate-100",
};

const STEP_COLORS = {
  blue:    "bg-blue-50 text-blue-700 border-blue-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  orange:  "bg-orange-50 text-orange-700 border-orange-100",
  indigo:  "bg-indigo-50 text-indigo-700 border-indigo-100",
  violet:  "bg-violet-50 text-violet-700 border-violet-100",
  sky:     "bg-sky-50 text-sky-700 border-sky-100",
  teal:    "bg-teal-50 text-teal-700 border-teal-100",
  slate:   "bg-slate-50 text-slate-600 border-slate-100",
};

// ── Per-EDI payload definitions ───────────────────────────────────────────────
function getEdiPayload(step, order) {
  const shipId   = order.carrierShipmentId || order.shipmentId || "SHP-XXXX";
  const vehicle  = typeof order.assignedVehicle === "object"
    ? order.assignedVehicle
    : { name: order.assignedVehicle || "—" };
  const items    = order.items?.length > 0 ? order.items : [{
    fabricType: order.fabricType || "Canvas", color: order.color || "Black",
    texture: order.texture || "Breathable Mesh", quantity: order.quantity || 0,
    unit: order.unit || "Meters", unitPrice: order.unitPrice || 750,
  }];
  const invoiceNo = `INV-${(order.poNumber || order.id || "").replace(/[^0-9]/g, "")}`;
  const totalAmt  = order.totalAmount || items.reduce((s, i) => s + (Number(i.quantity)||0)*(Number(i.unitPrice)||750), 0);

  const payloads = {
    // ── 850 — received from manufacturer ──────────────────────────────────────
    "850": {
      label: "Received from Manufacturer",
      json: {
        orderId:      order.id,
        poNumber:     order.poNumber || order.id,
        customer:     order.customer || order.customerName || "Vogue Manufacturing",
        customerName: order.customerName || order.customer,
        orderDate:    order.orderDate || order.createdAt,
        deliveryName: order.deliveryName,
        deliveryAddress: order.deliveryAddress,
        deliveryCity: order.deliveryCity,
        contactPerson: order.contactPerson,
        contactPhone:  order.contactPhone,
        totalAmount:  totalAmt,
        items,
      },
      x12: () => segmentsToX12String(getX12POSegments(order)),
    },

    // ── 855 — sent to manufacturer ─────────────────────────────────────────────
    0: {
      label: "Sent to Manufacturer",
      json: {
        orderId:        order.id,
        poNumber:       order.poNumber || order.id,
        customer:       order.customer || order.customerName,
        status:         order.partialAck ? "PartialAcknowledged" : "Acknowledged",
        acknowledgedAt: order.updatedAt || new Date().toISOString(),
        items: order.partialAckItems || items,
      },
      x12: () => getX12_855(order),
    },

    // ── 204 — sent to CarGo ────────────────────────────────────────────────────
    1: {
      label: "Sent to CarGo",
      json: {
        orderId:               order.id,
        poNumber:              order.poNumber || order.id,
        carrier:               "CarGo",
        serviceType:           "LTL",
        shipmentId:            shipId,
        weight:                `${order.totalWeightKg || 0}kg`,
        palletCount:           order.palletCount || 1,
        totalVolumeCbm:        order.totalVolumeCbm || 0,
        estimatedFreightCost:  2500,
        items,
      },
      x12: () => getX12_204(order),
    },

    // ── 990 — received from CarGo ──────────────────────────────────────────────
    2: {
      label: "Received from CarGo",
      json: {
        orderId:               order.id,
        shipmentId:            shipId,
        status:                "ACCEPTED",
        estimatedDeliveryDate: order.carrierEstimatedDelivery || "—",
        totalAmount:           order.freightTotalAmount || "—",
        assignedVehicle:       vehicle,
      },
      x12: () => getX12_990(order),
    },

    // ── 856 — sent to manufacturer ─────────────────────────────────────────────
    3: {
      label: "Sent to Manufacturer",
      json: {
        orderId:               order.id,
        poNumber:              order.poNumber || order.id,
        shipmentId:            shipId,
        shipDate:              order.carrierAcceptedAt || order.updatedAt || new Date().toISOString(),
        estimatedDeliveryDate: order.carrierEstimatedDelivery || new Date(Date.now() + 3*86400000).toISOString(),
        carrier:               "CarGo",
        serviceType:           "LTL",
        items,
      },
      x12: () => getX12_204(order),
    },

    // ── 214 — received from CarGo (sub-steps) ─────────────────────────────────
    4: {
      label: "Received from CarGo",
      json: null, // shown as sub-steps
      x12: () => getX12_214(order),
    },

    // ── 861 — received from manufacturer ──────────────────────────────────────
    5: {
      label: "Received from Manufacturer",
      json: order.receivingAdvice ? {
        orderId:       order.id,
        receivedAt:    order.receivingAdvice.receivedAt,
        notes:         order.receivingAdvice.notes,
        receivedItems: order.receivingAdvice.receivedItems || [],
      } : { orderId: order.id, receivedAt: "—", notes: "—", receivedItems: [] },
      x12: () => getX12_861(order),
    },

    // ── 810 — sent to manufacturer ─────────────────────────────────────────────
    6: {
      label: "Sent to Manufacturer",
      json: {
        orderId:        order.id,
        poNumber:       order.poNumber || order.id,
        invoiceNumber:  invoiceNo,
        invoiceDate:    order.updatedAt || new Date().toISOString(),
        materialsTotal: totalAmt,
        freightCost:    order.invoiceFreightCost || order.freightTotalAmount || 0,
        totalAmount:    order.invoicedTotalAmount || (totalAmt + Number(order.freightTotalAmount || 0)),
        items: [
          ...items.map(i => ({
            description: i.fabricType || i.productName || "Fabric",
            quantity:    i.quantity,
            unit:        i.unit || "Meters",
            unitPrice:   i.unitPrice || 750,
            lineTotal:   (Number(i.quantity)||0) * (Number(i.unitPrice)||750),
          })),
          ...(order.freightTotalAmount ? [{
            description: "Freight / Shipping (CarGo LTL)",
            quantity:    1,
            unit:        "Service",
            unitPrice:   Number(order.freightTotalAmount),
            lineTotal:   Number(order.freightTotalAmount),
          }] : []),
        ],
      },
      x12: () => segmentsToX12String(getX12InvoiceSegments(order)),
    },

    // ── 820 — received from manufacturer ──────────────────────────────────────
    7: {
      label: "Received from Manufacturer",
      json: order.edi820 ? {
        orderId:         order.id,
        poNumber:        order.poNumber || order.id,
        invoiceNumber:   order.edi820.invoiceNumber,
        paymentAmount:   order.edi820.paymentAmount,
        paymentMethod:   order.edi820.paymentMethod,
        referenceNumber: order.edi820.referenceNumber,
        paymentDate:     order.edi820.paymentDate,
        paymentStatus:   "Paid",
      } : { orderId: order.id, paymentAmount: totalAmt, paymentStatus: "Paid" },
      x12: () => getX12_820(order),
    },

    // ── 997 — sent to manufacturer ─────────────────────────────────────────────
    8: {
      label: "Sent to Manufacturer",
      json: order.edi997Payload || {
        orderId:        order.id,
        poNumber:       order.poNumber || order.id,
        invoiceNumber:  invoiceNo,
        totalAmount:    totalAmt,
        paymentStatus:  "Paid",
        acknowledgedAt: order.edi997SentAt || new Date().toISOString(),
      },
      x12: () => getX12_997(order),
    },
  };
  return payloads[step] || null;
}

// ── Mini viewer modal ─────────────────────────────────────────────────────────
function ViewerModal({ title, content, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-950 rounded-3xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col border border-slate-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-emerald-400" />
            <p className="text-xs font-black text-white">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { navigator.clipboard?.writeText(content).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-700 hover:bg-slate-600 text-white transition-colors">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          <pre className="text-emerald-400 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">{content}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function EDIDetailModal({ order, onClose }) {
  // EDI_STEPS has 9 entries (850 at index 0 as pre-step, then steps 0-7 at indices 1-8)
  // workflowStep 0-7 maps to EDI_STEPS index 1-8
  const isFullyComplete = order.workflowStep >= 7 && order.paymentStatus === "Paid";
  const currentEdiIdx = isFullyComplete
    ? EDI_STEPS.length - 1  // point to last step (820) as done
    : Math.min(order.workflowStep + 1, EDI_STEPS.length - 1);
  const currentEdi = EDI_STEPS[currentEdiIdx];
  const [viewer, setViewer]         = useState(null); // { title, content }
  const [show214, setShow214]       = useState(false);

  const openX12 = (step) => {
    const p = getEdiPayload(step, order);
    if (!p?.x12) return;
    setViewer({ title: `EDI ${EDI_STEPS.find(s => (s.step === -1 ? "850" : s.step) === step)?.code || step} — ANSI X12`, content: p.x12() });
  };

  const openJson = (step) => {
    const p = getEdiPayload(step, order);
    if (!p?.json) return;
    const code = EDI_STEPS.find(s => (s.step === -1 ? "850" : s.step) === step)?.code || step;
    setViewer({ title: `EDI ${code} — JSON Payload (${p.label})`, content: JSON.stringify(p.json, null, 2) });
  };

  const TRANSIT_SUBSTEPS = [
    { key: "Pending",    label: "Pending",    desc: "Load tender sent, awaiting pickup" },
    { key: "Pickup",     label: "Pickup",     desc: "Carrier picked up the shipment" },
    { key: "In Transit", label: "In Transit", desc: "Shipment is on the way" },
    { key: "Delivered",  label: "Delivered",  desc: "Shipment arrived at destination" },
  ];
  const currentTransitIdx = TRANSIT_SUBSTEPS.findIndex(s => s.key === (order.transitStatus || "Pending"));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">EDI Transaction Detail</p>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                {order.poNumber || order.id}
              </h3>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Current step highlight */}
            <div className={cn("rounded-2xl p-4 border flex items-center gap-3",
              order.declined ? "bg-red-50 border-red-100" : STEP_COLORS[currentEdi?.color || "slate"])}>
              {order.declined
                ? <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                : React.createElement(currentEdi?.icon || Zap, { className: "w-5 h-5 flex-shrink-0" })}
              <div>
                <p className="text-xs font-black uppercase tracking-widest">
                  {order.declined ? "Declined" : `EDI ${currentEdi?.code} — ${currentEdi?.name}`}
                </p>
                {!order.declined && (
                  <p className="text-[10px] font-medium mt-0.5 opacity-70">
                    {currentEdi?.dir === "IN" ? `← From ${currentEdi.from}` : `→ To ${currentEdi.to}`}
                  </p>
                )}
              </div>
              <span className={cn("ml-auto px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                DIR_COLORS[order.declined ? "—" : currentEdi?.dir || "—"])}>
                {order.declined ? "Terminated" : currentEdi?.dir}
              </span>
            </div>

            {/* Pipeline — each step with View X12 + JSON buttons */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">EDI Pipeline</p>
              <div className="space-y-1.5">
                {EDI_STEPS.map((s, i) => {
                  // step -1 (850) is always done — order exists means 850 was received
                  // step 8 (997) is done when edi997Sent, active when workflowStep >= 7 and not sent
                  let done, active;
                  if (s.step === -1) {
                    done = true; active = false;
                  } else if (s.step === 8) {
                    done   = !!order.edi997Sent;
                    active = !order.edi997Sent && order.workflowStep >= 7 && order.paymentStatus === "Paid" && !order.declined;
                  } else if (isFullyComplete) {
                    done = true; active = false;
                  } else {
                    done   = s.step < order.workflowStep;
                    active = s.step === order.workflowStep && !order.declined;
                  }
                  const Icon   = s.icon;
                  const payloadStep = s.step === -1 ? "850" : s.step;
                  const payload = getEdiPayload(payloadStep, order);
                  const hasX12  = !!payload?.x12;
                  const hasJson = !!payload?.json;
                  const is214   = s.code === "214";

                  return (
                    <div key={i}>
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl transition-all",
                        done   ? "bg-emerald-50"  :
                        active ? "bg-blue-50 ring-1 ring-blue-200" :
                                 "bg-slate-50/50"
                      )}>
                        {/* Status dot */}
                        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                          done   ? "bg-emerald-500 text-white" :
                          active ? "bg-blue-500 text-white" :
                                   "bg-slate-200 text-slate-400")}>
                          {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                        </div>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-xs font-black",
                            done ? "text-emerald-700" : active ? "text-blue-700" : "text-slate-400")}>
                            EDI {s.code} — {s.name}
                          </span>
                          {s.dir !== "—" && (
                            <span className={cn("ml-2 text-[9px] font-bold",
                              done || active ? "text-slate-500" : "text-slate-300")}>
                              {s.dir === "IN" ? `← ${s.from}` : `→ ${s.to}`}
                            </span>
                          )}
                        </div>

                        {/* Action buttons — only on done/active steps */}
                        {(done || active) && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {hasJson && (
                              <button onClick={() => openJson(payloadStep)}
                                className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                                JSON
                              </button>
                            )}
                            {hasX12 && (
                              <button onClick={() => openX12(payloadStep)}
                                className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors flex items-center gap-1">
                                <Code className="w-3 h-3" /> X12
                              </button>
                            )}
                            {is214 && (done || active) && (
                              <button onClick={() => setShow214(v => !v)}
                                className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-sky-100 hover:bg-sky-200 text-sky-700 transition-colors flex items-center gap-1">
                                {show214 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                214
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 214 sub-steps expansion */}
                      {is214 && show214 && (
                        <div className="ml-8 mt-1 space-y-1 border-l-2 border-sky-200 pl-3">
                          {TRANSIT_SUBSTEPS.map((ts, ti) => {
                            const tsDone   = ti < currentTransitIdx;
                            const tsActive = ti === currentTransitIdx;
                            return (
                              <div key={ts.key} className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs",
                                tsDone   ? "bg-emerald-50" :
                                tsActive ? "bg-sky-50 ring-1 ring-sky-200" :
                                           "bg-slate-50/50"
                              )}>
                                <div className={cn("w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-black",
                                  tsDone   ? "bg-emerald-500 text-white" :
                                  tsActive ? "bg-sky-500 text-white" :
                                             "bg-slate-200 text-slate-400")}>
                                  {tsDone ? "✓" : ti + 1}
                                </div>
                                <div className="flex-1">
                                  <span className={cn("font-black",
                                    tsDone ? "text-emerald-700" : tsActive ? "text-sky-700" : "text-slate-400")}>
                                    {ts.label}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-2">{ts.desc}</span>
                                </div>
                                {(tsDone || tsActive) && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setViewer({
                                        title: `EDI 214 — ${ts.label} (JSON Payload)`,
                                        content: JSON.stringify({
                                          shipmentId: order.carrierShipmentId || order.shipmentId || "SHP-XXXX",
                                          status: ts.key.toUpperCase().replace(/ /g, "_"),
                                          location: order.currentLocation || "—",
                                          description: order.lastDescription || "",
                                        }, null, 2),
                                      })}
                                      className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                                      JSON
                                    </button>
                                    <button
                                      onClick={() => setViewer({
                                        title: `EDI 214 — ${ts.label} (ANSI X12)`,
                                        content: getX12_214(order, ts.key),
                                      })}
                                      className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors flex items-center gap-1">
                                      <Code className="w-3 h-3" /> X12
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order info */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Order ID",   value: order.id },
                { label: "PO Number",  value: order.poNumber || "—" },
                { label: "Customer",   value: order.customer || order.customerName || "Vogue Manufacturing" },
                { label: "Updated At", value: order.updatedAt ? new Date(order.updatedAt).toLocaleString() : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                  <p className="text-xs font-black text-slate-900 truncate">{value}</p>
                </div>
              ))}
            </div>

            {order.declined && order.declineReason && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">Decline Reason</p>
                <p className="text-xs text-red-700 font-medium">{order.declineReason}</p>
              </div>
            )}
          </div>

          <div className="p-6 pt-0">
            <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>

      {/* Viewer sub-modal */}
      {viewer && <ViewerModal title={viewer.title} content={viewer.content} onClose={() => setViewer(null)} />}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const EDIFlow = ({ orders = [], fabrics }) => {
  const [searchTerm, setSearchTerm]       = useState("");
  const [activeTab, setActiveTab]         = useState("progress");
  const [filterDir, setFilterDir]         = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo, setDateTo]               = useState("");

  const filtered = orders.filter(o => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      (o.id || "").toLowerCase().includes(term) ||
      (o.poNumber || "").toLowerCase().includes(term) ||
      (o.customer || o.customerName || "").toLowerCase().includes(term);
    if (!matchSearch) return false;

    // Date range
    if (dateFrom || dateTo) {
      const d = new Date(o.createdAt || o.updatedAt || o.orderDate || 0);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) { const e = new Date(dateTo); e.setHours(23,59,59,999); if (d > e) return false; }
    }

    // Direction filter — based on current EDI step direction
    if (filterDir !== "all") {
      const ediStep = EDI_STEPS[Math.min(o.workflowStep + 1, EDI_STEPS.length - 1)];
      if (ediStep?.dir !== filterDir) return false;
    }

    if (activeTab === "rejecteds") return o.declined === true;
    if (o.declined === true) return false;
    const isComplete = o.workflowStep >= 7 && o.edi997Sent === true;
    return activeTab === "completed" ? isComplete : !isComplete;
  }).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  const progressCount  = orders.filter(o => !o.declined && !(o.workflowStep >= 7 && o.edi997Sent)).length;
  const completedCount = orders.filter(o => !o.declined && o.workflowStep >= 7 && o.edi997Sent === true).length;
  const rejectedCount  = orders.filter(o => o.declined === true).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 font-heading tracking-tight uppercase">
            EDI Monitor
          </h2>
          <p className="text-slate-500 text-sm font-medium tracking-tight">
            Live EDI transaction pipeline — 850 · 855 · 204 · 990 · 856 · 214 · 861 · 810
          </p>
        </div>
      </div>

      <div className="geometric-card">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          {/* Status tabs */}
          <div className="flex bg-white p-1 rounded-xl border border-slate-200">
            <button onClick={() => setActiveTab("progress")}
              className={cn("px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "progress" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600")}>
              <Zap className={cn("w-3.5 h-3.5", activeTab === "progress" ? "text-emerald-400" : "text-slate-300")} />
              In Progress
              <span className={cn("ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "progress" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                {progressCount}
              </span>
            </button>
            <button onClick={() => setActiveTab("completed")}
              className={cn("px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "completed" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-600")}>
              <CheckCircle2 className={cn("w-3.5 h-3.5", activeTab === "completed" ? "text-white" : "text-slate-300")} />
              Completed
              <span className={cn("ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "completed" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                {completedCount}
              </span>
            </button>
            <button onClick={() => setActiveTab("rejecteds")}
              className={cn("px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "rejecteds" ? "bg-red-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-600")}>
              <XCircle className={cn("w-3.5 h-3.5", activeTab === "rejecteds" ? "text-white" : "text-slate-300")} />
              Rejected
              <span className={cn("ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "rejecteds" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                {rejectedCount}
              </span>
            </button>
          </div>

          {/* Right controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Direction filter */}
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 gap-1">
              {[
                { key: "all", label: "All" },
                { key: "IN",  label: "← Inbound" },
                { key: "OUT", label: "→ Outbound" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFilterDir(key)}
                  className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    filterDir === key
                      ? key === "IN"  ? "bg-blue-600 text-white shadow"
                      : key === "OUT" ? "bg-emerald-600 text-white shadow"
                      :                 "bg-slate-900 text-white shadow"
                      : "text-slate-400 hover:text-slate-600")}>
                  {label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">From</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer" />
              <span className="text-slate-300 text-xs">·</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">To</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="ml-1 text-slate-300 hover:text-slate-500 transition-colors text-xs font-black">✕</button>
              )}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search by Order# or PO..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Order / PO</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Current EDI Step</th>
                <th className="px-6 py-4">Direction</th>
                <th className="px-6 py-4">Parties</th>
                <th className="px-6 py-4">Pipeline</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Zap className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                      {orders.length === 0 ? "No EDI transactions yet" : "No transactions match your filter"}
                    </p>
                  </td>
                </tr>
              ) : filtered.map(order => {
                const stepIdx  = Math.min(order.workflowStep + 1, EDI_STEPS.length - 1);
                const ediStep  = EDI_STEPS[stepIdx];
                const Icon     = ediStep?.icon || Zap;
                const stepColor = order.declined ? "slate" : (ediStep?.color || "slate");
                const material = order.items?.length > 0
                  ? `${order.items[0].fabricType || "—"} · ${order.items[0].color || ""}`
                  : `${order.fabricType || "—"} · ${order.color || ""}`;

                return (
                  <tr key={order.id}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedOrder(order)}>

                    {/* Order / PO */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <div className="p-1 px-2 bg-blue-100 rounded text-[10px] font-black text-blue-600">EDI</div>
                          <span className="text-sm font-black text-slate-900">{order.id}</span>
                        </div>
                        {order.poNumber && (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                            Ref: {order.poNumber}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">
                        {order.customer || order.customerName || "Vogue Manufacturing"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                        {material}
                      </div>
                    </td>

                    {/* Current EDI step */}
                    <td className="px-6 py-4">
                      {order.declined ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-red-50 text-red-600 border-red-100">
                          <XCircle className="w-3.5 h-3.5" /> Declined
                        </span>
                      ) : (
                        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                          STEP_COLORS[stepColor])}>
                          <Icon className="w-3.5 h-3.5" />
                          {ediStep?.code} · {ediStep?.name}
                        </span>
                      )}
                    </td>

                    {/* Direction */}
                    <td className="px-6 py-4">
                      {!order.declined && ediStep?.dir !== "—" ? (
                        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                          DIR_COLORS[ediStep?.dir || "—"])}>
                          {ediStep?.dir === "IN"
                            ? <ArrowLeft className="w-3 h-3" />
                            : <ArrowRight className="w-3 h-3" />}
                          {ediStep?.dir}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs font-black">—</span>
                      )}
                    </td>

                    {/* Parties */}
                    <td className="px-6 py-4">
                      {!order.declined && ediStep?.dir !== "—" ? (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                          <span className="font-black text-slate-800">{ediStep?.from}</span>
                          <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                          <span className="font-black text-slate-800">{ediStep?.to}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs font-black">—</span>
                      )}
                    </td>

                    {/* Pipeline progress */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 w-36">
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-wider text-slate-400">
                          <span>{order.declined ? "Terminated" : `Step ${order.workflowStep + 2}/${EDI_STEPS.length}`}</span>
                          <span>{order.declined ? "" : `${Math.round(((order.workflowStep + 1) / (EDI_STEPS.length - 1)) * 100)}%`}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                          {EDI_STEPS.map((_, i) => (
                            <div key={i} className={cn("h-full flex-1 transition-all rounded-sm",
                              order.declined ? "bg-red-300" :
                              i < order.workflowStep ? "bg-emerald-500" :
                              i === order.workflowStep ? "bg-blue-400" : "bg-slate-200")} />
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <Button variant="outline" size="sm"
                        className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg border-slate-200 hover:border-blue-400 hover:text-blue-600"
                        onClick={e => { e.stopPropagation(); setSelectedOrder(order); }}>
                        View
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selectedOrder && (
        <EDIDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
};
