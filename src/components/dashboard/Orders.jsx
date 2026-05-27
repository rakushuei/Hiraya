import React, { useState, useEffect } from "react";
import { Search, Plus, Filter, Package, Database, CheckCircle2, Truck, FileText, CreditCard, History, AlertCircle, X, ArrowRight, Zap, Factory, XCircle, MessageSquare, Check, Clock, Send, Download, Code } from "lucide-react";
import { Button, Badge } from "../ui/Common";
import { cn, generateId, conversions } from "../../lib/utils";
import { PurchaseOrder } from "./PurchaseOrder";
import { Invoice } from "./Invoice";
import { motion, AnimatePresence } from "motion/react";
import { rtdb, handleRTDBError, OperationType } from "../../lib/firebase";
import { ref, set, update, push, remove } from "firebase/database";
import { getX12POSegments, getX12InvoiceSegments, segmentsToX12String } from "../../lib/ediUtils";

const WORKFLOW_STEPS = [
  { name: "Supplier Confirmation (855)", icon: CheckCircle2 },
  { name: "Load Tender (204)",           icon: FileText },
  { name: "Logistics Tender Accepted (990)", icon: Check },
  { name: "Shipment Staged (856 Prep)",      icon: Truck },
  { name: "Transit Status Updates (214)", icon: Zap },
  { name: "Receiving Advice (861)",      icon: Package },
  { name: "Invoice (810)",               icon: CreditCard },
  { name: "Payment Received (820)",      icon: CheckCircle2 },
  { name: "Receipt Sent (997)",          icon: CheckCircle2 },
];

const MANUFACTURER_EDI_BASE = "https://rejoicing-exposable-destitute.ngrok-free.dev/api/edi";

// Fire-and-forget POST to manufacturer — routes through our backend to avoid CORS
async function notifyManufacturer(endpoint, body) {
  try {
    await fetch(`/api/edi/proxy-manufacturer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, body }),
    });
    console.log(`[EDI → Manufacturer] ${endpoint} sent`, body);
  } catch (err) {
    console.warn(`[EDI → Manufacturer] ${endpoint} failed:`, err.message);
  }
}

export const Orders = ({ orders, fabrics }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isEdiModalOpen, setIsEdiModalOpen] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isPoOpen, setIsPoOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("progress");
  const [supplierNote, setSupplierNote] = useState("");
  const [showDeclinePrompt, setShowDeclinePrompt] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [sendingTender, setSendingTender] = useState(false);
  const [stockError, setStockError]       = useState([]);
  const [x12Modal, setX12Modal]           = useState(null); // { title, content }

  // ── Stock availability check for 855 confirmation ─────────────────────────
  // Returns array of shortage objects, empty = all good
  const checkStockAvailability = (order) => {
    if (!fabrics) return [];
    const items = order.items || [{
      fabricType: order.fabricType,
      color:      order.color,
      texture:    order.texture,
      quantity:   order.quantity,
      unit:       order.unit || "Yards",
    }];

    const shortages = [];
    for (const item of items) {
      const type    = item.fabricType || item.productName?.split(" ")[0];
      const color   = item.color;
      const texture = item.texture;
      const unit    = item.unit || "Yards";

      if (!type) continue;

      const fabric = fabrics.find(f =>
        f.type?.toLowerCase()    === type?.toLowerCase() &&
        f.color?.toLowerCase()   === color?.toLowerCase() &&
        f.texture?.toLowerCase() === texture?.toLowerCase()
      );

      let qtyInMeters = Number(item.quantity) || 0;
      if (unit.toLowerCase() === "yards") qtyInMeters = conversions.yardsToMeters(qtyInMeters);
      else if (unit.toLowerCase() === "rolls") qtyInMeters = conversions.rollsToMeters(qtyInMeters);
      const rollsNeeded = conversions.metersToRolls(qtyInMeters);

      if (!fabric) {
        shortages.push({
          item: `${type} · ${color} · ${texture}`,
          needed: rollsNeeded,
          available: 0,
          reason: "Not found in inventory",
        });
      } else {
        const freeStock = (fabric.quantity || 0) - (fabric.reserved || 0);
        if (freeStock < rollsNeeded) {
          shortages.push({
            item: `${type} · ${color} · ${texture}`,
            needed: rollsNeeded,
            available: Math.max(0, freeStock),
            reason: freeStock <= 0 ? "Out of stock" : "Insufficient stock",
          });
        }
      }
    }
    return shortages;
  };
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  // Keep the open modal in sync with live RTDB data.
  // When the webhook writes to Firebase, `orders` prop updates via onValue listener —
  // this effect mirrors that into selectedOrder so the stepper advances automatically.
  const selectedOrderRef = React.useRef(selectedOrder);
  selectedOrderRef.current = selectedOrder;

  // ── New order highlight tracking ─────────────────────────────────────────
  // knownIds: IDs we've already seen. unseenIds: newly arrived ones to highlight.
  const knownIdsRef = React.useRef(null);
  const [unseenIds, setUnseenIds] = useState(new Set());

  useEffect(() => {
    const currentIds = new Set(orders.map(o => o.id));
    if (knownIdsRef.current === null) {
      // First load — mark all existing as known, nothing is "new"
      knownIdsRef.current = currentIds;
      return;
    }
    // Find IDs that weren't in the previous snapshot
    const newlyArrived = [...currentIds].filter(id => !knownIdsRef.current.has(id));
    if (newlyArrived.length > 0) {
      setUnseenIds(prev => {
        const next = new Set(prev);
        newlyArrived.forEach(id => next.add(id));
        return next;
      });
    }
    knownIdsRef.current = currentIds;
  }, [orders]);

  useEffect(() => {
    const current = selectedOrderRef.current;
    if (!current) return;
    const live = orders.find(o => o.id === current.id);
    if (!live) return;
    const changed =
      live.workflowStep !== current.workflowStep ||
      live.status !== current.status ||
      live.transitStatus !== current.transitStatus ||
      live.updatedAt !== current.updatedAt;
    if (changed) {
      setSelectedOrder(live);
    }
  }, [orders]);

  const filtered = orders.filter(o => {
    const poNum = o.poNumber || o.id || "";
    const cust = o.customer || o.customerName || "Vogue Manufacturing";
    
    const matchesSearch = poNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cust.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    // Date range filter
    if (dateFrom || dateTo) {
      const orderDate = new Date(o.createdAt || o.updatedAt || o.orderDate || 0);
      if (dateFrom && orderDate < new Date(dateFrom)) return false;
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        if (orderDate > toEnd) return false;
      }
    }

    if (activeTab === "rejecteds") return o.declined === true;
    
    // Exclude declined orders from other tabs
    if (o.declined === true) return false;

    const isComplete = o.workflowStep >= WORKFLOW_STEPS.length - 1;
    return activeTab === "completed" ? isComplete : !isComplete;
  }).sort((a, b) => {
    const dateA = new Date(a.createdAt || a.updatedAt || a.orderDate || 0);
    const dateB = new Date(b.createdAt || b.updatedAt || b.orderDate || 0);
    return dateB - dateA;
  });

  const progressCount = orders.filter(o => o.declined !== true && o.workflowStep < WORKFLOW_STEPS.length - 1).length;
  const completedCount = orders.filter(o => o.declined !== true && o.workflowStep >= WORKFLOW_STEPS.length - 1).length;
  const rejectedCount = orders.filter(o => o.declined === true).length;

  const calculateTotal = (order) => {
    if (order.totalAmount) return order.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (order.quantity * (order.items?.[0]?.unitPrice || 750)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const simulateEdiImport = async () => {
    const id = generateId("SO");
    const newOrder = {
      id,
      poNumber: `PO-MANU-SIM-${Math.floor(Math.random() * 1000)}`,
      customer: "Vogue Manufacturing",
      fabricType: "Denim",
      color: "Blue",
      texture: "Heavyweight",
      quantity: 150,
      unit: "Yards",
      orderDate: new Date().toISOString().split('T')[0],
      status: WORKFLOW_STEPS[0].name,
      workflowStep: 0,
      updatedAt: new Date().toISOString()
    };

    // Merge X12 segments
    const x12Segments = getX12POSegments(newOrder);
    const finalOrder = { ...newOrder, "EDI Transaction": x12Segments };
    
    try {
      // In this version, we don't reserve upon import, only upon confirmation/approval
      await set(ref(rtdb, `orders/${id}`), finalOrder);

      setIsEdiModalOpen(false);
      alert("EDI Transmission Synchronized: Data streamed directly from Manufacturer Hub. Ready for Confirmation.");
    } catch (e) {
      console.error("Sync error:", e);
    }
  };

  const reserveStock = async (order) => {
    if (!fabrics) return;
    
    // Support multi-item orders
    const itemsToReserve = order.items || [{ 
      fabricType: order.fabricType, 
      color: order.color, 
      texture: order.texture, 
      quantity: order.quantity,
      unit: order.unit || "Yards"
    }];

    for (const item of itemsToReserve) {
      const type = item.fabricType || item.productName?.split(" ")[0];
      const color = item.color;
      const texture = item.texture;
      const unit = item.unit || "Yards";

      let fabricToUpdate = fabrics.find(f => 
        f.type.toLowerCase() === type?.toLowerCase() &&
        f.color.toLowerCase() === color?.toLowerCase() &&
        f.texture.toLowerCase() === texture?.toLowerCase()
      );

      // Convert quantity to meters first, then to rolls
      let qtyInMeters = item.quantity;
      if (unit.toLowerCase() === "yards") {
        qtyInMeters = conversions.yardsToMeters(item.quantity);
      } else if (unit.toLowerCase() === "rolls") {
        qtyInMeters = conversions.rollsToMeters(item.quantity);
      }

      const rollsNeeded = conversions.metersToRolls(qtyInMeters);
      const sku = `SKU-${type.substring(0,3).toUpperCase()}-${color.substring(0,3).toUpperCase()}-${texture.substring(0,3).toUpperCase()}`;

      try {
        if (fabricToUpdate) {
          // As requested: "reserve and decrease the qty"
          // We'll treat 'quantity' as the main floating stock and 'reserved' as locked stock.
          await update(ref(rtdb, `fabrics/${fabricToUpdate.id}`), {
            reserved: (fabricToUpdate.reserved || 0) + rollsNeeded,
            updatedAt: new Date().toISOString()
          });
        } else {
          // Create on the fly if missing
          await set(ref(rtdb, `fabrics/${sku}`), {
            id: sku,
            type,
            color,
            texture,
            gsm: 180,
            width: 150,
            rollLength: 100,
            quantity: 100, // Base level
            reserved: rollsNeeded,
            reorderLevel: 15,
            status: "Available",
            updatedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        console.error("Stock reservation error:", e);
      }
    }
  };

  const deductStock = async (order) => {
    if (!fabrics) return;
    
    const itemsToDeduct = order.items || [{ 
      fabricType: order.fabricType, 
      color: order.color, 
      texture: order.texture, 
      quantity: order.quantity,
      unit: order.unit || "Yards"
    }];

    for (const item of itemsToDeduct) {
      const type = item.fabricType || item.productName?.split(" ")[0];
      const color = item.color;
      const texture = item.texture;
      const unit = item.unit || "Yards";

      const fabricToUpdate = fabrics.find(f => 
        f.type.toLowerCase() === type.toLowerCase() &&
        f.color.toLowerCase() === color.toLowerCase() &&
        f.texture.toLowerCase() === texture.toLowerCase()
      );

      let qtyInMeters = item.quantity;
      if (unit.toLowerCase() === "yards") {
        qtyInMeters = conversions.yardsToMeters(item.quantity);
      } else if (unit.toLowerCase() === "rolls") {
        qtyInMeters = conversions.rollsToMeters(item.quantity);
      }
      
      const rollsToDeduct = conversions.metersToRolls(qtyInMeters);

      try {
        if (fabricToUpdate) {
          const newQuantity = Math.max(0, fabricToUpdate.quantity - rollsToDeduct);
          const newReserved = Math.max(0, (fabricToUpdate.reserved || 0) - rollsToDeduct);
          
          await update(ref(rtdb, `fabrics/${fabricToUpdate.id}`), {
            quantity: newQuantity,
            reserved: newReserved,
            status: newQuantity <= fabricToUpdate.reorderLevel ? (newQuantity <= fabricToUpdate.reorderLevel * 0.5 ? "Critical" : "Low Stock") : "Available",
            updatedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        console.error("Stock deduction error:", e);
      }
    }
  };

  const advanceWorkflow = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (order && order.workflowStep < WORKFLOW_STEPS.length - 1) {
      const nextStep = order.workflowStep + 1;
      let x12Updates = {};
      let dispatchLog = {};
      
      setLoading(true);
      try {
        if (nextStep === 1) {
          // Step 0→1: Confirm (855) — reserve stock, then notify manufacturer
          await reserveStock(order);

          try {
            const res855 = await fetch("/api/edi/proxy-manufacturer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                endpoint: "receive-855",
                body: {
                  orderId:        order.id,
                  poNumber:       order.poNumber || order.id,
                  customer:       order.customer || order.customerName || "Vogue Manufacturing",
                  status:         "Acknowledged",
                  acknowledgedAt: new Date().toISOString(),
                  items: (order.items || [{
                    fabricType: order.fabricType, color: order.color, texture: order.texture,
                    quantity: order.quantity, unit: order.unit || "Meters", unitPrice: order.unitPrice || 750,
                  }]),
                },
              }),
            });
            console.log("[EDI 855] Sent:", await res855.json());
          } catch (e) { console.error("[EDI 855] Failed:", e.message); }

        } else if (nextStep === 3) {
          // Step 2→3: 990 accepted → Shipment Dispatched
          // (no action needed here — 856 fires on the next click at step 3→4)

        } else if (nextStep === 4) {
          // Step 3→4: Dispatch Materials (856) — deduct stock, then notify manufacturer
          await deductStock(order);

          // Send 856 ASN through server proxy (avoids browser CORS)
          const asnPayload = {
            orderId:               order.id,
            poNumber:              order.poNumber || order.id,
            shipmentId:            order.carrierShipmentId || order.shipmentId || `SHP-${Date.now()}`,
            shipDate:              order.carrierAcceptedAt || new Date().toISOString(),
            estimatedDeliveryDate: order.carrierEstimatedDelivery || new Date(Date.now() + 3 * 86400000).toISOString(),
            carrier:               "CarGo",
            serviceType:           "LTL",
            assignedVehicle:       order.assignedVehicle || null,
            items: (order.items || [{
              fabricType: order.fabricType,
              color:      order.color,
              texture:    order.texture,
              quantity:   order.quantity,
              unit:       order.unit || "Meters",
            }]),
          };

          try {
            const asnRes = await fetch("/api/edi/proxy-manufacturer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: "receive-856", body: asnPayload }),
            });
            const asnData = await asnRes.json();
            console.log("[EDI 856] ASN sent to manufacturer:", asnData);
          } catch (asnErr) {
            console.error("[EDI 856] Failed to send ASN:", asnErr.message);
            // Non-fatal — workflow still advances
          }

        } else if (nextStep === 5) {
          // Step 4→5: Receiving Advice (861) — buyer scans and confirms receipt
          // This step is normally triggered automatically by the buyer via
          // POST /api/edi/receive/861, but can also be manually advanced here.
          // No outbound notification needed — we are the receiver of the 861.

        } else if (nextStep === 6) {
          // Step 5→6: Invoice (810) — generate invoice segments, then notify manufacturer
          x12Updates = { "EDI Transaction": getX12InvoiceSegments(order) };
          const invoiceNumber  = `INV-${(order.poNumber || order.id).replace(/[^0-9]/g, "")}`;
          const materialsTotal = order.totalAmount ||
            (order.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 750), 0) ||
            (order.quantity || 0) * 750;
          // Add freight cost from 990 so manufacturer covers shipping
          const freightCost    = Number(order.freightTotalAmount || 0);
          const grandTotal     = materialsTotal + freightCost;

          const lineItems = (order.items || [{
            fabricType: order.fabricType, color: order.color, texture: order.texture,
            quantity: order.quantity, unit: order.unit || "Meters", unitPrice: order.unitPrice || 750,
          }]).map(i => ({
            description: i.fabricType || i.productName || "Fabric",
            quantity:    i.quantity,
            unit:        i.unit || "Meters",
            unitPrice:   i.unitPrice || 750,
            lineTotal:   (i.quantity || 0) * (i.unitPrice || 750),
          }));

          // Add freight as a separate line item if present
          if (freightCost > 0) {
            lineItems.push({
              description: "Freight / Shipping (CarGo LTL)",
              quantity:    1,
              unit:        "Service",
              unitPrice:   freightCost,
              lineTotal:   freightCost,
            });
          }

          try {
            const res810 = await fetch("/api/edi/proxy-manufacturer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                endpoint: "receive-810",
                body: {
                  orderId:       order.id,
                  poNumber:      order.poNumber || order.id,
                  invoiceNumber,
                  invoiceDate:   new Date().toISOString(),
                  materialsTotal,
                  freightCost,
                  totalAmount:   grandTotal,
                  items:         lineItems,
                },
              }),
            });
            console.log("[EDI 810] Sent:", await res810.json());
          } catch (e) { console.error("[EDI 810] Failed:", e.message); }

          // Store grand total on order so 820 can validate against it
          await update(ref(rtdb, `orders/${order.id}`), {
            invoicedTotalAmount: grandTotal,
            invoiceFreightCost:  freightCost,
            updatedAt:           new Date().toISOString(),
          });

        } else if (nextStep === 7) {
          // Step 6→7: Payment Received (820) — set by 820 webhook automatically
          // Manual advance here just marks it for demo purposes

        } else if (nextStep === 8) {
          // Step 7→8: Receipt Sent (997) — send functional acknowledgement
          // This is normally triggered by the "Send 997" button in Invoice Billing
        }

        await update(ref(rtdb, `orders/${orderId}`), { 
          workflowStep: nextStep, 
          status: WORKFLOW_STEPS[nextStep].name,
          updatedAt: new Date().toISOString(),
          declined: false,
          ...x12Updates,
          ...dispatchLog
        });

      } catch (e) {
        console.error("Workflow update error:", e);
      } finally {
        setLoading(false);
      }
    }
  };

  const sendLoadTender = async (order) => {
    setSendingTender(true);
    try {
      console.log(`[EDI-204] Dispatching load tender for order ${order.id}...`);
      const res = await fetch("/api/edi/send-204", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order })
      });
      const resData = await res.json();

      if (!res.ok && res.status !== 202) {
        const errMsg = resData.error || "Unknown error";
        await update(ref(rtdb, `orders/${order.id}`), {
          logisticsSyncStatus: "Failed",
          logisticsSyncError: errMsg,
          updatedAt: new Date().toISOString()
        });
        alert(`Load Tender failed: ${errMsg}`);
        return;
      }

      // Success or 202 accepted — advance to step 2 (Logistics Tender Accepted / 990)
      const nextStep = 2;
      // Extract CarGo's returned shipmentId if present — but do NOT store it as
      // carrierShipmentId yet. The authoritative shipmentId comes from the 990
      // webhook payload (what CarGo sends back when they accept). Storing the
      // 204 response id here would overwrite the correct one.
      const dispatchLog = {
        logisticsSyncStatus: resData.timeout ? "Pending" : "Success",
        carrierReference: resData.data?.carrierReference || resData.data?.id || resData.data?.shipmentId || null,
        workflowStep: nextStep,
        status: WORKFLOW_STEPS[nextStep].name,
        updatedAt: new Date().toISOString()
      };
      await update(ref(rtdb, `orders/${order.id}`), dispatchLog);
      setSelectedOrder(prev => ({
        ...prev,
        workflowStep: nextStep,
        status: WORKFLOW_STEPS[nextStep].name,
        logisticsSyncStatus: dispatchLog.logisticsSyncStatus
      }));
    } catch (apiErr) {
      console.error("[EDI-204] Error:", apiErr.message);
      alert(`Network error sending Load Tender: ${apiErr.message}`);
    } finally {
      setSendingTender(false);
    }
  };

  const releaseStock = async (order) => {
    if (!fabrics) return;
    
    const itemsToRelease = order.items || [{ 
      fabricType: order.fabricType, 
      color: order.color, 
      texture: order.texture, 
      quantity: order.quantity 
    }];

    for (const item of itemsToRelease) {
      const type = item.fabricType || item.productName?.split(" ")[0];
      const color = item.color;
      const texture = item.texture;

      let fabricToUpdate = fabrics.find(f => 
        f.type.toLowerCase() === type?.toLowerCase() &&
        f.color.toLowerCase() === color?.toLowerCase() &&
        f.texture.toLowerCase() === texture?.toLowerCase()
      );

      if (fabricToUpdate && (fabricToUpdate.reserved || 0) > 0) {
        const rollsToRelease = Math.ceil(item.quantity / 50);
        try {
          await update(ref(rtdb, `fabrics/${fabricToUpdate.id}`), {
            reserved: Math.max(0, fabricToUpdate.reserved - rollsToRelease),
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.error("Stock release error:", e);
        }
      }
    }
  };

  const declineOrder = async (orderId, reason) => {
    setLoading(true);
    const order = orders.find(o => o.id === orderId);
    console.log("Declining order:", orderId);
    try {
      if (order && order.workflowStep > 0) {
        await releaseStock(order);
      }

      // Send EDI 855 rejection to manufacturer via proxy
      const rejectionPayload = {
        orderId:       orderId,
        poNumber:      order?.poNumber || orderId,
        customer:      order?.customer || order?.customerName || "Vogue Manufacturing",
        status:        "Rejected",
        rejectedAt:    new Date().toISOString(),
        declineReason: reason,
        items: (order?.items || [{
          fabricType: order?.fabricType,
          color:      order?.color,
          texture:    order?.texture,
          quantity:   order?.quantity,
          unit:       order?.unit || "Meters",
        }]),
      };
      fetch("/api/edi/proxy-manufacturer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "receive-855", body: rejectionPayload }),
      }).catch(() => {}); // fire-and-forget

      await update(ref(rtdb, `orders/${orderId}`), {
        status: "Declined",
        declined: true,
        declineReason: reason,
        updatedAt: new Date().toISOString()
      });
      console.log("Decline successful — 855 rejection sent to manufacturer");
      // Move to rejecteds tab and close modal
      setActiveTab("rejecteds");
      setSelectedOrder(null);
      setSupplierNote("");
      setDeclineNote("");
      setShowDeclinePrompt(false);
    } catch (e) {
      console.error("Decline error:", e);
      handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
      setLoading(false);
    }
  };

  const sendOrderMessage = async (orderId, message) => {
    try {
      await update(ref(rtdb, `orders/${orderId}`), {
        supplierNote: message,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("Message error:", e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 font-heading tracking-tight uppercase">Incoming Requests</h2>
          <p className="text-slate-500 text-sm font-medium tracking-tight">Purchase Order Fulfillment Pipeline (Manufacturer ➔ Supplier)</p>
        </div>
        <div className="flex gap-2">
        </div>
      </div>

      <div className="geometric-card">
        <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex bg-white p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setActiveTab("progress")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "progress" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Zap className={cn("w-3.5 h-3.5", activeTab === "progress" ? "text-emerald-400" : "text-slate-300")} />
              In Progress
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "progress" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {progressCount}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab("completed")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "completed" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <CheckCircle2 className={cn("w-3.5 h-3.5", activeTab === "completed" ? "text-white" : "text-slate-300")} />
              Completed
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "completed" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {completedCount}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab("rejecteds")}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "rejecteds" ? "bg-red-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <XCircle className={cn("w-3.5 h-3.5", activeTab === "rejecteds" ? "text-white" : "text-slate-300")} />
              Rejecteds
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                activeTab === "rejecteds" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {rejectedCount}
              </span>
            </button>
          </div>

          {/* Right side: date range + search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Date range filter */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
              />
              <span className="text-slate-300 text-xs">·</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="ml-1 text-slate-300 hover:text-slate-500 transition-colors text-xs font-black"
                  title="Clear dates"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by Order#..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Protocol ID</th>
                <th className="px-6 py-4">Manufacturer Plant</th>
                <th className="px-6 py-4">Received Date</th>
                <th className="px-6 py-4">Raw Material Specs</th>
                <th className="px-6 py-4 text-right">Qty</th>
                <th className="px-6 py-4">Fulfillment Stage</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((po) => {
                const isNew = unseenIds.has(po.id);
                const clearNew = () => {
                  if (isNew) setUnseenIds(prev => { const n = new Set(prev); n.delete(po.id); return n; });
                };
                return (
                <tr
                  key={po.id}
                  className={cn(
                    "transition-colors group cursor-pointer relative",
                    isNew
                      ? "bg-emerald-50/70 hover:bg-emerald-50"
                      : "hover:bg-slate-50/50"
                  )}
                  onClick={() => { setSelectedOrder(po); clearNew(); }}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        {/* Left accent bar for new orders */}
                        {isNew && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r-full" />
                        )}
                        <div className="p-1 px-2 bg-emerald-100 rounded text-[10px] font-black text-emerald-600">SO</div>
                        <span className="text-sm font-black text-slate-900">{po.id}</span>
                        {isNew && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white animate-pulse">
                            New
                          </span>
                        )}
                      </div>
                      {po.poNumber && (
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">
                          Ref PO: {po.poNumber}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-900">{po.customer || "Vogue Manufacturing"}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Manufacturing Partner</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-900">
                      {new Date(po.createdAt || po.updatedAt || po.orderDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-[8px] mt-0.5">
                      {new Date(po.createdAt || po.updatedAt || po.orderDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-600">
                    {po.items && po.items.length > 1 ? (
                      <div className="flex flex-col">
                        <span>{po.items[0].fabricType} • {po.items[0].color}</span>
                        <span className="text-[10px] text-emerald-500 font-black uppercase">+{po.items.length - 1} MORE MATERIALS</span>
                      </div>
                    ) : (
                      <span>{po.fabricType || po.items?.[0]?.fabricType} • {po.color || po.items?.[0]?.color} • {po.texture || po.items?.[0]?.texture}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-black text-slate-900">
                    {conversions.formatQty(po.quantity, po.unit)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5 w-40">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {po.declined ? (
                          <span className="text-red-500 font-bold">Protocol Terminated</span>
                        ) : (
                          <>
                            <span>{WORKFLOW_STEPS[po.workflowStep]?.name || "Complete"}</span>
                            <span>{Math.round(((po.workflowStep + 1) / WORKFLOW_STEPS.length) * 100)}%</span>
                          </>
                        )}
                      </div>
                      {po.declined ? (
                        <div className="h-1.5 w-full bg-red-100 rounded-full overflow-hidden">
                          <div className="h-full w-full bg-red-500" />
                        </div>
                      ) : (
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                          {WORKFLOW_STEPS.map((_, i) => (
                            <div key={i} className={cn("h-full flex-1 transition-all", i <= po.workflowStep ? "bg-emerald-500" : "bg-slate-200")} />
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg border-slate-200 hover:border-blue-400 hover:text-blue-600 gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrder(po);
                          setIsPoOpen(true);
                        }}
                      >
                        <FileText className="w-3.5 h-3.5" /> View PO
                      </Button>
                      {po.workflowStep >= 6 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg border-slate-200 hover:border-emerald-400 hover:text-emerald-600 gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(po);
                            setIsInvoiceOpen(true);
                          }}
                        >
                          <CreditCard className="w-3.5 h-3.5" /> View Invoice
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] font-black tracking-widest px-3 rounded-lg border-slate-200 hover:border-primary hover:text-primary gap-1.5"
                        onClick={(e) => { e.stopPropagation(); setSelectedOrder(po); }}
                      >
                        <Zap className="w-3.5 h-3.5" /> Review
                      </Button>
                    </div>
                  </td>
                </tr>
                ); })}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isEdiModalOpen && (
          <ModalContainer onClose={() => setIsEdiModalOpen(false)} title="EDI Transmission Portal">
            <div className="space-y-6">
              <div className="p-4 bg-slate-900 rounded-xl text-primary font-mono text-xs overflow-x-auto whitespace-pre">
{`{
  "header": {
    "sender": "MANUFACTURER-ERP-VOGUE",
    "receiver": "HIRAYA-SUPPLIER",
    "protocol": "EDIFACT-X12"
  },
  "body": {
    "orderType": "PURCHASE_ORDER",
    "sku": "DENIM-BLUE-HEAVY",
    "quantity": 150,
    "unit": "Yards"
  }
}`}
              </div>
              <p className="text-sm text-slate-500 font-medium bg-slate-50 p-4 rounded-xl border border-slate-100">
                Incoming ERP data detected. Click the button below to parse the JSON and inject the order into your Hiraya fulfillment pipeline.
              </p>
              <div className="flex gap-4">
                <Button variant="outline" className="flex-1" onClick={() => setIsEdiModalOpen(false)}>Ignore</Button>
                <Button className="flex-1" onClick={simulateEdiImport}>Inject to Pipeline</Button>
              </div>
            </div>
          </ModalContainer>
        )}

        {selectedOrder && !isPoOpen && !isInvoiceOpen && (
          <ModalContainer key="pipeline-modal" onClose={() => { setSelectedOrder(null); setStockError([]); }} title={`Purchase Order Pipeline: ${selectedOrder.poNumber}`}>
            <div className="space-y-8">
              {/* Stepper */}
              <div className="relative">
                <div className="absolute top-5 left-10 right-10 h-0.5 bg-slate-100 -z-10" />
                <div className="flex justify-between">
                  {WORKFLOW_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    const isCompleted = i < selectedOrder.workflowStep;
                    const isActive = i === selectedOrder.workflowStep;
                    const isDeclined = selectedOrder.declined && isActive;
                    
                    return (
                      <div key={i} className="flex flex-col items-center gap-2 group text-center uppercase tracking-tighter">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all border-4 relative",
                          isCompleted ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-100" : 
                          isActive ? (isDeclined ? "bg-red-500 border-red-500 text-white" : "bg-white border-blue-600 text-blue-600 shadow-xl scale-110") : 
                          "bg-white border-slate-100 text-slate-300"
                        )}>
                          {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                          {isActive && !isDeclined && (
                             <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-20" />
                          )}
                        </div>
                        <span className={cn(
                          "text-[9px] font-black w-14", 
                          isCompleted ? "text-emerald-500" :
                          isActive ? (isDeclined ? "text-red-500" : "text-blue-600") : "text-slate-400"
                        )}>
                          {step.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Inventory Synchronization</h4>

                {(() => {
                  // Normalise to items array
                  const orderItems = selectedOrder.items?.length > 0
                    ? selectedOrder.items
                    : [{
                        fabricType: selectedOrder.fabricType,
                        color:      selectedOrder.color,
                        texture:    selectedOrder.texture,
                        quantity:   selectedOrder.quantity,
                        unit:       selectedOrder.unit || "Meters",
                      }];

                  return (
                    <div className="space-y-3">
                      {orderItems.map((item, idx) => {
                        const type    = (item.fabricType || item.productName?.split(" ")[0] || "").toLowerCase();
                        const color   = (item.color   || "").toLowerCase();
                        const texture = (item.texture || "").toLowerCase();

                        // Exact match: type + color + texture
                        let match = fabrics?.find(f =>
                          f.type?.toLowerCase()    === type &&
                          f.color?.toLowerCase()   === color &&
                          f.texture?.toLowerCase() === texture
                        );
                        // Fallback: type + color only
                        if (!match) {
                          match = fabrics?.find(f =>
                            f.type?.toLowerCase()  === type &&
                            f.color?.toLowerCase() === color
                          );
                        }

                        const totalRolls  = match ? Number(match.quantity || 0) : null;
                        const reserved    = match ? Number(match.reserved  || 0) : 0;
                        const freeRolls   = totalRolls !== null ? totalRolls - reserved : null;
                        const freeMeters  = freeRolls !== null ? conversions.rollsToMeters(freeRolls) : null;
                        const reorderLvl  = match?.reorderLevel || 15;

                        const statusColor = freeRolls === null
                          ? "text-slate-400"
                          : freeRolls <= 0
                          ? "text-red-600"
                          : freeRolls <= reorderLvl
                          ? "text-amber-600"
                          : "text-emerald-600";

                        const statusLabel = freeRolls === null
                          ? "Not in inventory"
                          : freeRolls <= 0
                          ? "Out of stock"
                          : freeRolls <= reorderLvl
                          ? "Low stock"
                          : "Available";

                        return (
                          <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100">
                            <div>
                              <div className="text-sm font-black text-slate-900">
                                {item.fabricType || item.productName || "—"}
                              </div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase">
                                {item.color} • {item.texture}
                              </div>
                              <div className={cn("text-[9px] font-black uppercase tracking-widest mt-0.5", statusColor)}>
                                {statusLabel}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black text-blue-600">
                                Requested: {conversions.formatQty(item.quantity, item.unit)}
                              </div>
                              {freeRolls !== null ? (
                                <>
                                  <div className={cn("text-[10px] font-black uppercase", statusColor)}>
                                    Free: {freeRolls} rolls (~{freeMeters?.toFixed(0)}m)
                                  </div>
                                  {reserved > 0 && (
                                    <div className="text-[9px] text-slate-400 font-bold">
                                      {reserved} reserved / {totalRolls} total
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-[10px] font-black text-slate-400 uppercase">
                                  SKU not found
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* EDI 214 Transit Status sub-stepper */}
              {selectedOrder.workflowStep === 4 && (
                <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-blue-400 animate-pulse" />
                      <div>
                        <h4 className="text-xs font-black uppercase text-white tracking-widest">EDI 214 Transit Status</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Updated automatically by CarGo Logistics via webhook</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
                      Live 214 Update
                    </span>
                  </div>

                  {/* Read-only status track */}
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 py-2 relative">
                    {/* Background line */}
                    <div className="hidden md:block absolute top-1/2 left-8 right-8 h-[2px] -translate-y-1/2 bg-slate-800 -z-10" />

                    {/* Filled progress line */}
                    {(() => {
                      const statuses = ["Pending", "Pickup", "In Transit", "Delivered"];
                      const currentIndex = statuses.indexOf(selectedOrder.transitStatus || "Pending");
                      const pct = currentIndex === 0 ? 0 : currentIndex === 1 ? 33 : currentIndex === 2 ? 66 : 100;
                      return (
                        <div
                          className="hidden md:block absolute top-1/2 left-8 h-[2px] -translate-y-1/2 bg-emerald-500 transition-all duration-500 -z-10"
                          style={{ width: `calc(${pct}% - ${currentIndex === 0 ? 0 : currentIndex === 3 ? 16 : 8}px)` }}
                        />
                      );
                    })()}

                    {/* Read-only status pills */}
                    {(() => {
                      const statuses = [
                        { key: "Pending",    label: "Pending",    icon: Clock },
                        { key: "Pickup",     label: "Pickup",     icon: Package },
                        { key: "In Transit", label: "In Transit", icon: Truck },
                        { key: "Delivered",  label: "Delivered",  icon: CheckCircle2 },
                      ];
                      const currentIndex = statuses.findIndex(s => s.key === (selectedOrder.transitStatus || "Pending"));

                      return statuses.map((item, idx) => {
                        const isCompleted = idx < currentIndex;
                        const isActive    = idx === currentIndex;
                        const Icon        = item.icon;

                        let pillStyle, iconColor;
                        if (isCompleted) {
                          pillStyle = "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20";
                          iconColor = "text-emerald-400";
                        } else if (isActive) {
                          if (item.key === "Delivered") {
                            pillStyle = "bg-emerald-600 text-white border border-emerald-500";
                            iconColor = "text-white";
                          } else if (item.key === "In Transit") {
                            pillStyle = "bg-blue-600 text-white border border-blue-500";
                            iconColor = "text-white";
                          } else {
                            pillStyle = "bg-slate-100 text-slate-900 border border-white shadow-lg";
                            iconColor = "text-slate-900";
                          }
                        } else {
                          pillStyle = "bg-slate-800/80 text-slate-600 border border-slate-700";
                          iconColor = "text-slate-600";
                        }

                        return (
                          <div
                            key={item.key}
                            className={cn(
                              "w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-bold relative select-none",
                              pillStyle
                            )}
                          >
                            <Icon className={cn("w-4 h-4", iconColor)} />
                            <span>{item.label}</span>
                            {isActive && (
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Info note */}
                  <div className="flex items-center gap-2.5 bg-slate-800/40 rounded-xl px-4 py-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      Status is updated automatically when CarGo sends an EDI 214 webhook. No manual action needed.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {!selectedOrder.declined && selectedOrder.workflowStep < WORKFLOW_STEPS.length - 1 && (
                  <div className="space-y-4 mb-4 border-t border-slate-100 pt-6">
                    {/* Stock shortage — partial acknowledgement options */}
                    {stockError.length > 0 && selectedOrder.workflowStep === 0 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-amber-100/60">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
                              Partial Stock — Some Items Unavailable
                            </p>
                          </div>
                          <button onClick={() => setStockError([])} className="text-amber-400 hover:text-amber-600 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="px-4 py-3 space-y-2">
                          {stockError.map((s, i) => (
                            <div key={i} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-amber-100">
                              <div>
                                <p className="text-xs font-black text-slate-800">{s.item}</p>
                                <p className="text-[10px] text-red-500 font-bold mt-0.5">{s.reason}</p>
                              </div>
                              <div className="text-right flex-shrink-0 ml-4">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Needed / Available</p>
                                <p className="text-sm font-black text-red-600">{s.needed} <span className="text-slate-400 font-medium text-xs">/ {s.available} rolls</span></p>
                              </div>
                            </div>
                          ))}

                          <p className="text-[10px] text-amber-700 font-bold pt-1">
                            You can partially acknowledge — confirm available items and notify the manufacturer of shortages.
                          </p>

                          <div className="flex gap-2 pt-1">
                            {/* Partial Acknowledge */}
                            <button
                              disabled={loading}
                              onClick={async () => {
                                setLoading(true);
                                try {
                                  const allItems = (selectedOrder.items || [{
                                    fabricType: selectedOrder.fabricType, color: selectedOrder.color,
                                    texture: selectedOrder.texture, quantity: selectedOrder.quantity,
                                    unit: selectedOrder.unit || "Meters", unitPrice: selectedOrder.unitPrice || 750,
                                  }]);

                                  const acknowledgedItems = allItems.map(item => {
                                    const key = `${item.fabricType} · ${item.color} · ${item.texture}`;
                                    const shortage = stockError.find(s => s.item === key);
                                    return {
                                      ...item,
                                      status:            shortage ? "Partial" : "Accepted",
                                      quantityAvailable: shortage ? shortage.available : item.quantity,
                                      quantityRequested: item.quantity,
                                      quantityShort:     shortage ? (shortage.needed - shortage.available) : 0,
                                    };
                                  });

                                  // Send partial 855 to manufacturer
                                  await fetch("/api/edi/proxy-manufacturer", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      endpoint: "receive-855",
                                      body: {
                                        orderId:        selectedOrder.id,
                                        poNumber:       selectedOrder.poNumber || selectedOrder.id,
                                        customer:       selectedOrder.customer || "Vogue Manufacturing",
                                        status:         "PartialAcknowledged",
                                        acknowledgedAt: new Date().toISOString(),
                                        items:          acknowledgedItems,
                                      },
                                    }),
                                  }).catch(() => {});

                                  await reserveStock(selectedOrder);
                                  const nextStep = 1;
                                  await update(ref(rtdb, `orders/${selectedOrder.id}`), {
                                    workflowStep:    nextStep,
                                    status:          WORKFLOW_STEPS[nextStep].name,
                                    partialAck:      true,
                                    partialAckItems: acknowledgedItems,
                                    updatedAt:       new Date().toISOString(),
                                    declined:        false,
                                  });
                                  setStockError([]);
                                  setSelectedOrder(prev => ({ ...prev, workflowStep: nextStep, status: WORKFLOW_STEPS[nextStep].name }));
                                } catch (e) {
                                  console.error("Partial ack error:", e);
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-500 text-white transition-all disabled:opacity-60"
                            >
                              {loading
                                ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Partial Acknowledge
                            </button>

                            {/* Decline all */}
                            <button
                              onClick={() => { setStockError([]); setShowDeclinePrompt(true); }}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white hover:bg-red-50 text-red-600 border border-red-200 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Decline All
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3">
                      {selectedOrder.workflowStep === 0 && !showDeclinePrompt && (
                        <Button 
                          variant="outline" 
                          className="flex-1 gap-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200"
                          onClick={() => setShowDeclinePrompt(true)}
                        >
                          <XCircle className="w-4 h-4" /> Decline Request
                        </Button>
                      )}

                      {!showDeclinePrompt ? (
                        // Step 1: user manually sends 204 Load Tender, then waits for CarGo 990 webhook.
                        // Step 4 (214 Transit) is fully controlled by CarGo webhooks.
                        selectedOrder.workflowStep === 1 ? (
                          <div className="flex-1 flex flex-col gap-3">
                            {/* Load Tender card */}
                            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <Send className="w-4 h-4 text-blue-400" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-white uppercase tracking-widest">EDI 204 — Load Tender</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Ready to dispatch to CarGo Logistics</p>
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest">
                                  Pending Send
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-slate-800/60 rounded-xl p-2.5">
                                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Carrier</p>
                                  <p className="text-xs font-black text-white">CarGo</p>
                                </div>
                                <div className="bg-slate-800/60 rounded-xl p-2.5">
                                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Service</p>
                                  <p className="text-xs font-black text-white">LTL</p>
                                </div>
                                <div className="bg-slate-800/60 rounded-xl p-2.5">
                                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Next Step</p>
                                  <p className="text-xs font-black text-emerald-400">EDI 990</p>
                                </div>
                              </div>

                              <button
                                disabled={sendingTender}
                                onClick={() => sendLoadTender(selectedOrder)}
                                className={cn(
                                  "w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                  sendingTender
                                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/20 cursor-not-allowed"
                                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 hover:shadow-blue-900/60 active:scale-[0.98]"
                                )}
                              >
                                {sendingTender ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                                    Dispatching Load Tender...
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-4 h-4" />
                                    Send Load Tender (EDI 204)
                                    <ArrowRight className="w-4 h-4 ml-auto" />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : selectedOrder.workflowStep === 2 ? (
                          <div className="flex-1 flex flex-col gap-3">
                            {selectedOrder.status === "Carrier Rejected (990)" ? (
                              /* ── Rejection card ── */
                              <div className="bg-red-950/40 rounded-2xl p-5 border border-red-500/30 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                                      <XCircle className="w-4 h-4 text-red-400" />
                                    </div>
                                    <div>
                                      <p className="text-xs font-black text-white uppercase tracking-widest">EDI 990 — Load Tender Rejected</p>
                                      <p className="text-[9px] text-red-400 font-bold uppercase tracking-wider">CarGo declined your load tender (EDI 204)</p>
                                    </div>
                                  </div>
                                  <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-red-500/15 text-red-400 border border-red-500/30 uppercase tracking-widest flex items-center gap-1.5">
                                    <XCircle className="w-3 h-3" /> Rejected
                                  </span>
                                </div>

                                {/* Reason */}
                                <div className="flex items-start gap-3 bg-red-500/10 rounded-xl px-4 py-3">
                                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[9px] text-red-400 font-black uppercase tracking-widest mb-0.5">Rejection Reason</p>
                                    <p className="text-xs text-red-200 font-medium">
                                      {selectedOrder.declineReason || selectedOrder.carrierRejectedReason || "No reason provided by carrier."}
                                    </p>
                                  </div>
                                </div>

                                {/* Rejected at */}
                                {selectedOrder.carrierRejectedAt && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-800/60 rounded-xl p-2.5">
                                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Rejected At</p>
                                      <p className="text-xs font-black text-white">
                                        {new Date(selectedOrder.carrierRejectedAt).toLocaleString()}
                                      </p>
                                    </div>
                                    <div className="bg-slate-800/60 rounded-xl p-2.5">
                                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Carrier</p>
                                      <p className="text-xs font-black text-white">CarGo</p>
                                    </div>
                                  </div>
                                )}

                                {/* Resend button */}
                                <button
                                  disabled={sendingTender}
                                  onClick={() => sendLoadTender(selectedOrder)}
                                  className={cn(
                                    "w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                    sendingTender
                                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/20 cursor-not-allowed"
                                      : "bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/30 active:scale-[0.98]"
                                  )}
                                >
                                  {sendingTender ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                                      Resending Load Tender...
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-4 h-4" />
                                      Resend Load Tender (EDI 204)
                                      <ArrowRight className="w-4 h-4 ml-auto" />
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              /* ── Waiting card ── */
                              <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                      <Check className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div>
                                      <p className="text-xs font-black text-white uppercase tracking-widest">EDI 990 — Logistics Tender</p>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Waiting for CarGo to acknowledge the load tender</p>
                                    </div>
                                  </div>
                                  <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                                    Awaiting 990
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center">
                                  <div className="bg-slate-800/60 rounded-xl p-2.5">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Carrier</p>
                                    <p className="text-xs font-black text-white">CarGo</p>
                                  </div>
                                  <div className="bg-slate-800/60 rounded-xl p-2.5">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">204 Sent</p>
                                    <p className="text-xs font-black text-emerald-400">✓ Done</p>
                                  </div>
                                  <div className="bg-slate-800/60 rounded-xl p-2.5">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Next Step</p>
                                    <p className="text-xs font-black text-blue-400">EDI 856</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-3">
                                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    CarGo will send an EDI 990 acceptance. The order will automatically advance to Shipment Dispatched (856).
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : selectedOrder.workflowStep === 4 ? (
                          // Step 4 — 214 Transit in progress, waiting for delivery
                          <div className="flex-1 flex items-center justify-center gap-3 h-14 bg-blue-50 border border-blue-100 rounded-2xl px-4">
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                              Awaiting Carrier Transit Updates (EDI 214)...
                            </span>
                          </div>
                        ) : selectedOrder.workflowStep === 5 ? (
                          // Step 5 — 861 Receiving Advice received, now awaiting Invoice (810)
                          <div className="flex-1 flex flex-col gap-3">
                            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 space-y-4">
                              {/* Header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                                    <Package className="w-4 h-4 text-teal-400" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-white uppercase tracking-widest">EDI 861 — Receiving Advice</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Goods received and verified by manufacturer</p>
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase tracking-widest flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" /> Received
                                </span>
                              </div>

                              {selectedOrder.receivingAdvice ? (() => {
                                const ra = selectedOrder.receivingAdvice;
                                const items = ra.receivedItems || [];
                                const totalOrdered  = items.reduce((s, i) => s + (Number(i.quantityOrdered)  || 0), 0);
                                const totalReceived = items.reduce((s, i) => s + (Number(i.quantityReceived) || 0), 0);
                                const totalDamaged  = items.reduce((s, i) => s + (Number(i.quantityDamaged)  || 0), 0);
                                const allGood = totalDamaged === 0;

                                return (
                                  <>
                                    {/* Summary row */}
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                      {[
                                        { label: "Received At", value: ra.receivedAt ? new Date(ra.receivedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—", color: "text-white" },
                                        { label: "Total Received", value: `${totalReceived.toLocaleString()} / ${totalOrdered.toLocaleString()}`, color: "text-teal-400" },
                                        { label: "Damaged", value: totalDamaged > 0 ? totalDamaged.toLocaleString() : "None", color: totalDamaged > 0 ? "text-red-400" : "text-emerald-400" },
                                      ].map(({ label, value, color }) => (
                                        <div key={label} className="bg-slate-800/60 rounded-xl p-2.5">
                                          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">{label}</p>
                                          <p className={cn("text-xs font-black", color)}>{value}</p>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Per-item breakdown */}
                                    {items.length > 0 && (
                                      <div className="space-y-2">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Item Breakdown</p>
                                        {items.map((item, idx) => {
                                          const damaged  = Number(item.quantityDamaged)  || 0;
                                          const received = Number(item.quantityReceived) || 0;
                                          const ordered  = Number(item.quantityOrdered)  || 0;
                                          const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0;
                                          return (
                                            <div key={idx} className="bg-slate-800/40 rounded-xl p-3 space-y-2">
                                              {/* Item header */}
                                              <div className="flex items-center justify-between">
                                                <div>
                                                  <p className="text-xs font-black text-white">{item.fabricType || "—"}</p>
                                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                                    {item.color} · {item.texture}
                                                  </p>
                                                </div>
                                                <span className={cn(
                                                  "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                                  damaged > 0
                                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                )}>
                                                  {damaged > 0 ? `${damaged} Damaged` : "All Good"}
                                                </span>
                                              </div>
                                              {/* Qty row */}
                                              <div className="grid grid-cols-3 gap-1.5 text-center">
                                                <div className="bg-slate-900/60 rounded-lg p-1.5">
                                                  <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">Ordered</p>
                                                  <p className="text-[10px] font-black text-slate-300">{ordered.toLocaleString()} {item.unit || "m"}</p>
                                                </div>
                                                <div className="bg-slate-900/60 rounded-lg p-1.5">
                                                  <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">Received</p>
                                                  <p className="text-[10px] font-black text-teal-400">{received.toLocaleString()} {item.unit || "m"}</p>
                                                </div>
                                                <div className="bg-slate-900/60 rounded-lg p-1.5">
                                                  <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">Damaged</p>
                                                  <p className={cn("text-[10px] font-black", damaged > 0 ? "text-red-400" : "text-slate-500")}>
                                                    {damaged > 0 ? `${damaged.toLocaleString()} ${item.unit || "m"}` : "—"}
                                                  </p>
                                                </div>
                                              </div>
                                              {/* Progress bar */}
                                              <div className="space-y-0.5">
                                                <div className="flex justify-between text-[7px] font-black text-slate-500 uppercase tracking-widest">
                                                  <span>Receipt rate</span>
                                                  <span>{pct}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                                  <div
                                                    className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-teal-400")}
                                                    style={{ width: `${pct}%` }}
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Notes */}
                                    {ra.notes && (
                                      <div className="flex items-start gap-2.5 bg-slate-800/40 rounded-xl px-3 py-2.5">
                                        <AlertCircle className={cn("w-3.5 h-3.5 flex-shrink-0 mt-0.5", totalDamaged > 0 ? "text-red-400" : "text-slate-400")} />
                                        <p className="text-[10px] text-slate-300 font-medium leading-relaxed">{ra.notes}</p>
                                      </div>
                                    )}
                                  </>
                                );
                              })() : (
                                /* No 861 yet — waiting state */
                                <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-3">
                                  <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse flex-shrink-0" />
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                    Waiting for the manufacturer to send EDI 861 Receiving Advice.
                                  </p>
                                </div>
                              )}

                              {/* Hint / action prompt */}
                              <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-3">
                                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", selectedOrder.receivingAdvice ? "bg-amber-400 animate-pulse" : "bg-slate-600")} />
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  {selectedOrder.receivingAdvice
                                    ? "Proceed to generate and send the Invoice (EDI 810) to the manufacturer."
                                    : "Waiting for the manufacturer to send EDI 861 Receiving Advice before you can generate the invoice."}
                                </p>
                              </div>

                              {/* Button — locked until 861 received */}
                              <button
                                disabled={loading || !selectedOrder.receivingAdvice}
                                onClick={() => {
                                  if (!selectedOrder.receivingAdvice) return;
                                  advanceWorkflow(selectedOrder.id);
                                  const nextStep = selectedOrder.workflowStep + 1;
                                  setSelectedOrder(prev => ({
                                    ...prev,
                                    workflowStep: nextStep,
                                    status: WORKFLOW_STEPS[nextStep].name,
                                  }));
                                }}
                                className={cn(
                                  "w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                  !selectedOrder.receivingAdvice
                                    ? "bg-slate-700/50 text-slate-500 border border-slate-700 cursor-not-allowed"
                                    : loading
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 cursor-not-allowed"
                                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 active:scale-[0.98]"
                                )}
                              >
                                {loading ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                    Generating Invoice...
                                  </>
                                ) : !selectedOrder.receivingAdvice ? (
                                  <>
                                    <Clock className="w-4 h-4" />
                                    Awaiting EDI 861 from Manufacturer
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="w-4 h-4" />
                                    Generate Invoice &amp; Send EDI 810
                                    <ArrowRight className="w-4 h-4 ml-auto" />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : selectedOrder.workflowStep === 6 ? (
                          // Step 6 — Invoice sent, awaiting payment (820)
                          <div className="flex-1 flex flex-col gap-3">
                            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <CreditCard className="w-4 h-4 text-amber-400" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-white uppercase tracking-widest">EDI 810 — Invoice Sent</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Awaiting payment remittance (EDI 820) from manufacturer</p>
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                                  Pending Payment
                                </span>
                              </div>
                              <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-3">
                                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  The manufacturer will send payment via EDI 820. The order advances to Fulfillment Complete automatically once payment is confirmed.
                                </p>
                              </div>
                              {/* View invoice button inside the card */}
                              <button
                                onClick={() => setIsInvoiceOpen(true)}
                                className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-xs font-black uppercase tracking-widest bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all active:scale-[0.98]"
                              >
                                <FileText className="w-4 h-4" />
                                View EDI 810 Invoice
                              </button>
                            </div>
                          </div>
                        ) : selectedOrder.workflowStep === 7 ? (
                          // Step 7 — Payment Received (820)
                          <div className="flex-1 flex flex-col gap-3">
                            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-white uppercase tracking-widest">EDI 820 — Payment Received</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                      ₱{Number(selectedOrder.amountPaid || selectedOrder.totalAmount || 0).toLocaleString()} received from manufacturer
                                    </p>
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" /> Paid
                                </span>
                              </div>
                              {selectedOrder.edi820 && (
                                <div className="grid grid-cols-2 gap-2">
                                  {[
                                    { label: "Payment Method", value: selectedOrder.edi820.paymentMethod || "Bank Transfer" },
                                    { label: "Reference",      value: selectedOrder.edi820.referenceNumber || "—" },
                                    { label: "Payment Date",   value: selectedOrder.edi820.paymentDate ? new Date(selectedOrder.edi820.paymentDate).toLocaleDateString() : "—" },
                                    { label: "Amount",         value: `₱${Number(selectedOrder.edi820.paymentAmount || 0).toLocaleString()}` },
                                  ].map(({ label, value }) => (
                                    <div key={label} className="bg-slate-800/60 rounded-xl p-2.5">
                                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">{label}</p>
                                      <p className="text-xs font-black text-white">{value}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  Send EDI 997 Functional Acknowledgement to confirm receipt of payment.
                                </p>
                              </div>
                              {!selectedOrder.edi997Sent ? (
                                <button
                                  disabled={loading}
                                  onClick={() => {
                                    advanceWorkflow(selectedOrder.id);
                                    const nextStep = 8;
                                    setSelectedOrder(prev => ({ ...prev, workflowStep: nextStep, status: WORKFLOW_STEPS[nextStep].name }));
                                  }}
                                  className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 active:scale-[0.98] transition-all"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Send Receipt (EDI 997)
                                  <ArrowRight className="w-4 h-4 ml-auto" />
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 bg-emerald-500/10 rounded-xl px-4 py-3">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">EDI 997 Receipt Sent</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : selectedOrder.workflowStep === 8 ? (
                          // Step 8 — Receipt Sent (997) — fully complete
                          <div className="flex-1 flex flex-col gap-3">
                            <div className="bg-slate-900 rounded-2xl p-5 border border-emerald-500/20 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-white uppercase tracking-widest">EDI 997 — Receipt Sent</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Functional acknowledgement sent to manufacturer</p>
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[8px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
                                  Complete
                                </span>
                              </div>
                              <div className="flex items-center gap-3 bg-emerald-500/10 rounded-xl px-4 py-3">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                                  Order fulfillment cycle complete. All EDI transactions processed successfully.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                        <Button
                          className="flex-1 gap-2 bg-emerald-600 text-white h-14"
                          disabled={loading}
                          onClick={() => {
                            if (selectedOrder.workflowStep === 0) {
                              const shortages = checkStockAvailability(selectedOrder);
                              if (shortages.length > 0) {
                                setStockError(shortages);
                                return;
                              }
                              setStockError([]);
                            }
                            advanceWorkflow(selectedOrder.id);
                            const nextStep = selectedOrder.workflowStep + 1;
                            setSelectedOrder(prev => ({
                              ...prev, 
                              workflowStep: nextStep,
                              status: WORKFLOW_STEPS[nextStep].name
                            }));
                          }}
                        >
                          {loading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-5 h-5" /> 
                              {selectedOrder.workflowStep === 0 ? "Confirm Request & Send EDI 855" : 
                               selectedOrder.workflowStep === 3 ? "Dispatch Materials & Send ASN (EDI 856)" :
                               "Fulfillment Completed"}
                            </>
                          )}
                        </Button>
                        )
                      ) : (
                        <div className="flex-1 bg-red-50 p-4 rounded-2xl border border-red-100 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-red-900 uppercase tracking-widest">Specify Rejection Reason</h4>
                            <button onClick={() => setShowDeclinePrompt(false)} className="text-red-400 hover:text-red-600">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <textarea 
                            className="w-full p-3 bg-white border border-red-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-red-500/10 min-h-[80px] text-slate-800"
                            placeholder="Provide a reason for the manufacturer (e.g., Fabric currently out of stock, Pricing mismatch)..."
                            value={declineNote}
                            onChange={(e) => setDeclineNote(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              className="flex-1 h-10 text-[10px] font-black border-red-200 text-red-600 uppercase"
                              onClick={() => setShowDeclinePrompt(false)}
                            >
                              Cancel
                            </Button>
                            <Button 
                              className="flex-[2] h-10 text-[10px] font-black bg-red-600 text-white hover:bg-red-700 uppercase"
                              onClick={() => {
                                if (!declineNote.trim()) {
                                  alert("Please provide a reason for rejection.");
                                  return;
                                }
                                declineOrder(selectedOrder.id, declineNote);
                              }}
                            >
                              Confirm Rejection
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedOrder.declined && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center">
                    <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <h4 className="text-sm font-black text-red-900 uppercase">Request Declined</h4>
                    <p className="text-xs text-red-600 mt-1">{selectedOrder.declineReason || "Purchase order was rejected by supplier."}</p>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <Button variant="outline" className="flex-1" onClick={() => {
                    setSelectedOrder(null);
                    setSupplierNote("");
                  }}>Close</Button>
                </div>
              </div>
            </div>
          </ModalContainer>
        )}
        {isPoOpen && selectedOrder && (
          <ModalContainer key="po-modal" onClose={() => setIsPoOpen(false)} title="Purchase Order Document" size="large">
            <div className="overflow-y-auto max-h-[75vh] px-4">
              <PurchaseOrder order={selectedOrder} />
            </div>
            <div className="flex gap-4 mt-8 px-4">
               <Button variant="outline" className="flex-1" onClick={() => setIsPoOpen(false)}>Close Document</Button>
               <Button
                variant="outline"
                className="flex-1 gap-2 border-slate-200 hover:border-blue-400 hover:text-blue-600"
                onClick={() => {
                  // Always generate fresh 850 segments from order data.
                  // Never use order["EDI Transaction"] — it gets overwritten with 810 at invoice step.
                  const segments = getX12POSegments(selectedOrder);
                  setX12Modal({
                    title: `EDI 850 — Purchase Order · ${selectedOrder.poNumber || selectedOrder.id}`,
                    content: segmentsToX12String(segments),
                    segments,
                  });
                }}
               >
                 <Zap className="w-4 h-4" /> View ANSI X12
               </Button>
               <Button 
                className="flex-[2] gap-2 bg-blue-600 text-white hover:bg-blue-700" 
                onClick={() => {
                  alert('Purchase Order copy saved to local drive.');
                }}
               >
                 <Zap className="w-4 h-4" /> EXPORT PDF
               </Button>
            </div>
          </ModalContainer>
        )}
        {isInvoiceOpen && selectedOrder && (
          <ModalContainer key="invoice-modal" onClose={() => setIsInvoiceOpen(false)} title="Commercial Sales Invoice">
            {/* Use the Invoice component — same as InvoiceBilling tab */}
            <div id="invoice-print-area" className="overflow-y-auto max-h-[65vh] rounded-2xl border border-slate-100">
              <Invoice order={selectedOrder} />
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setIsInvoiceOpen(false)}>Close</Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600"
                onClick={() => {
                  // Always generate fresh 810 segments — stored EDI Transaction may be stale
                  const segments = getX12InvoiceSegments(selectedOrder);
                  setX12Modal({
                    title: `EDI 810 — Invoice · ${selectedOrder.poNumber || selectedOrder.id}`,
                    content: segmentsToX12String(segments),
                    segments,
                  });
                }}
              >
                <Code className="w-4 h-4" /> View ANSI X12
              </Button>
              <Button
                className="flex-1 gap-2 bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => {
                  const invoiceEl = document.getElementById("invoice-print-area");
                  if (!invoiceEl) return;
                  const win = window.open("", "_blank");
                  win.document.write(`<!DOCTYPE html><html><head><title>Invoice</title>
                    <style>body{margin:0;font-family:sans-serif;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
                    </head><body>${invoiceEl.innerHTML}</body></html>`);
                  win.document.close();
                  win.focus();
                  setTimeout(() => { win.print(); }, 500);
                }}
              >
                <Download className="w-4 h-4" /> Export PDF
              </Button>
            </div>
          </ModalContainer>
        )}
        {/* ANSI X12 viewer modal */}
        {x12Modal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-slate-950 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-800 flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Code className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ANSI X12 Translation</p>
                    <h3 className="text-sm font-black text-white">{x12Modal.title}</h3>
                  </div>
                </div>
                <button
                  onClick={() => setX12Modal(null)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* Segment legend */}
              <div className="px-6 py-3 border-b border-slate-800 flex-shrink-0 flex flex-wrap gap-3">
                {[
                  { seg: "ISA/IEA", desc: "Interchange Envelope" },
                  { seg: "GS/GE",   desc: "Functional Group" },
                  { seg: "ST/SE",   desc: "Transaction Set" },
                  { seg: "BEG/BIG", desc: "Header" },
                  { seg: "N1",      desc: "Party Name" },
                  { seg: "PO1/IT1", desc: "Line Item" },
                  { seg: "TDS",     desc: "Total Amount" },
                  { seg: "CTT",     desc: "Item Count" },
                ].map(({ seg, desc }) => (
                  <div key={seg} className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-emerald-400 font-mono">{seg}</span>
                    <span className="text-[9px] text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>

              {/* X12 content */}
              <div className="overflow-y-auto flex-1 p-6">
                <pre className="text-xs font-mono text-emerald-400 leading-relaxed whitespace-pre-wrap break-all">
                  {x12Modal.content || "No X12 data available for this order."}
                </pre>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-800 flex-shrink-0 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                  onClick={() => setX12Modal(null)}
                >
                  Close
                </Button>
                <Button
                  className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    navigator.clipboard?.writeText(x12Modal.content || "").catch(() => {});
                    const btn = document.activeElement;
                    if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy to Clipboard"; }, 1500); }
                  }}
                >
                  <Code className="w-4 h-4" /> Copy to Clipboard
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ModalContainer = ({ children, onClose, title, size = "medium" }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
      onClick={onClose} 
    />
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className={cn(
        "relative bg-white w-full rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]",
        size === "large" ? "max-w-5xl" : "max-w-2xl"
      )}
    >
      {/* Fixed header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
        <h3 className="text-2xl font-black text-slate-900 font-heading uppercase tracking-tight pr-8">{title}</h3>
        <button onClick={onClose} className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-900 rounded-xl transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>
      {/* Scrollable content */}
      <div className="overflow-y-auto flex-1 px-8 pb-8">
        {children}
      </div>
    </motion.div>
  </div>
);
