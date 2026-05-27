const mapUnitToX12 = (unit) => {
  const codes = {
    "Yards": "YD",
    "Meters": "MR",
    "Kilograms": "KG",
    "Pounds": "LB",
    "Each": "EA",
    "Rolls": "RL",
    "Bolts": "BT"
  };
  return codes[unit] || "MR";
};

/**
 * Returns raw ANSI X12 850 (Purchase Order) segments
 * Handles both flat orders (fabricType/color/texture) and multi-item orders (items[])
 */
export const getX12POSegments = (order) => {
  const date = new Date(order.createdAt || order.updatedAt || order.orderDate || Date.now());
  const formattedDate = date.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const formattedTime = date.toISOString().replace(/[-:T]/g, '').slice(9, 13);

  // Normalise items — support both flat and nested
  const items = (order.items && order.items.length > 0)
    ? order.items
    : [{
        fabricType:  order.fabricType  || "Canvas",
        productName: order.fabricType  || "Canvas Fabric",
        color:       order.color       || "",
        texture:     order.texture     || "",
        quantity:    order.quantity    || 0,
        unit:        order.unit        || "Meters",
        unitPrice:   order.unitPrice   || 0,
        materialNo:  order.materialNo  || "",
      }];

  const sender   = (order.customer || order.customerName || "MANUFACTURER").substring(0, 15).toUpperCase().padEnd(15, ' ');
  const receiver = "HIRAYA         ";
  const controlNo = (order.id || "0").replace(/[^0-9]/g, "").slice(-9).padStart(9, '0');

  return {
    "ISA": {
      "ISA01": "00", "ISA02": "          ",
      "ISA03": "00", "ISA04": "          ",
      "ISA05": "12", "ISA06": sender,
      "ISA07": "12", "ISA08": receiver,
      "ISA09": formattedDate, "ISA10": formattedTime,
      "ISA11": "U", "ISA12": "00401",
      "ISA13": controlNo, "ISA14": "0", "ISA15": "P", "ISA16": ">"
    },
    "GS": {
      "GS01": "PO",
      "GS02": (order.customer || "MANUFACTURER").toUpperCase(),
      "GS03": "HIRAYA",
      "GS04": formattedDate, "GS05": formattedTime,
      "GS06": "1", "GS07": "X", "GS08": "004010"
    },
    "ST": { "ST01": "850", "ST02": "0001" },
    "BEG": {
      "BEG01": "00", "BEG02": "NE",
      "BEG03": order.poNumber || order.id || "PO-001",
      "BEG04": "", "BEG05": formattedDate
    },
    "REF": { "REF01": "CO", "REF02": order.id || "SO-001" },
    "N1_SU": { "N101": "SU", "N102": "HIRAYA", "N103": "92", "N104": "HIRAYA-PH-01" },
    "N3_SU": { "N301": "148 Industrial Ave, Sector 4" },
    "N4_SU": { "N401": "Manila", "N402": "NCR", "N403": "1000", "N404": "PH" },
    "N1_BY": {
      "N101": "BY",
      "N102": order.customerName || order.customer || "MANUFACTURER",
      "N103": "92", "N104": "CUST-01"
    },
    "N3_BY": { "N301": order.deliveryAddress || "FCIE Compound, Governors Drive" },
    "N4_BY": {
      "N401": order.deliveryCity?.split(",")[0]?.trim() || "Dasmarinas",
      "N402": "PH", "N403": "4114", "N404": "PH"
    },
    "PER": {
      "PER01": "CN",
      "PER02": order.contactPerson || "Supplier Coordinator",
      "PER03": "TE", "PER04": order.contactPhone || "0917-000-0001"
    },
    "PO1": items.map((item, idx) => ({
      "PO101": String(idx + 1),
      "PO102": String(item.quantity || 0),
      "PO103": mapUnitToX12(item.unit || order.unit || "Meters"),
      "PO104": String(item.unitPrice || 0),
      "PO105": "PE",
      "PO106": "VP",
      "PO107": item.materialNo || `SKU-${(item.fabricType || "FAB").substring(0,3).toUpperCase()}`,
      "PO108": "EN",
      "PO109": item.productName || item.fabricType || "Fabric",
    })),
    "CTT": {
      "CTT01": String(items.length),
      "CTT02": String(items.reduce((s, i) => s + (Number(i.quantity) || 0), 0))
    },
    "AMT": { "AMT01": "TT", "AMT02": String(order.totalAmount || items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0)) },
    "SE": { "SE01": String(10 + items.length * 2), "SE02": "0001" },
    "GE": { "GE01": "1", "GE02": "1" },
    "IEA": { "IEA01": "1", "IEA02": controlNo }
  };
};

export const getX12InvoiceSegments = (order) => {
  const date = new Date(order.updatedAt || order.createdAt || Date.now());
  const formattedDate = date.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const formattedTime = date.toISOString().replace(/[-:T]/g, '').slice(9, 13);

  const poRef     = (order.poNumber || order.id || "PO-001").replace(/[^a-zA-Z0-9-]/g, "");
  const invoiceNo = order.invoiceNumber || `INV-${poRef}`;
  const controlNo = (order.id || "0").replace(/[^0-9]/g, "").slice(-9).padStart(9, '0');

  // Normalise items — same fallback as 850
  const items = (order.items && order.items.length > 0)
    ? order.items
    : [{
        fabricType: order.fabricType || "Canvas",
        productName: order.fabricType || "Canvas Fabric",
        quantity:   order.quantity   || 0,
        unit:       order.unit       || "Meters",
        unitPrice:  order.unitPrice  || 0,
        materialNo: order.materialNo || "",
      }];

  const totalAmount = order.totalAmount ||
    items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  const receiver = (order.customer || order.customerName || "MANUFACTURER")
    .substring(0, 15).toUpperCase().padEnd(15, ' ');

  return {
    "ISA": {
      "ISA01": "00", "ISA02": "          ",
      "ISA03": "00", "ISA04": "          ",
      "ISA05": "12", "ISA06": "HIRAYA         ",
      "ISA07": "12", "ISA08": receiver,
      "ISA09": formattedDate, "ISA10": formattedTime,
      "ISA11": "U", "ISA12": "00401",
      "ISA13": controlNo, "ISA14": "0", "ISA15": "P", "ISA16": ">"
    },
    "GS": {
      "GS01": "IN", "GS02": "HIRAYA",
      "GS03": (order.customer || "MANUFACTURER").toUpperCase(),
      "GS04": formattedDate, "GS05": formattedTime,
      "GS06": "1", "GS07": "X", "GS08": "004010"
    },
    "ST": { "ST01": "810", "ST02": "0001" },
    "BIG": {
      "BIG01": formattedDate,
      "BIG02": invoiceNo,
      "BIG03": formattedDate,
      "BIG04": order.poNumber || order.id || "PO-001"
    },
    "REF": { "REF01": "CO", "REF02": order.id || "SO-001" },
    "N1_SU": { "N101": "SU", "N102": "HIRAYA", "N103": "92", "N104": "HIRAYA-PH-01" },
    "N3_SU": { "N301": "148 Industrial Ave, Sector 4" },
    "N4_SU": { "N401": "Manila", "N402": "NCR", "N403": "1000", "N404": "PH" },
    "N1_BY": {
      "N101": "BY",
      "N102": order.customerName || order.customer || "MANUFACTURER",
      "N103": "92", "N104": "CUST-01"
    },
    "N3_BY": { "N301": order.deliveryAddress || "FCIE Compound, Governors Drive" },
    "N4_BY": {
      "N401": order.deliveryCity?.split(",")[0]?.trim() || "Dasmarinas",
      "N402": "PH", "N403": "4114", "N404": "PH"
    },
    "IT1": items.map((item, idx) => ({
      "IT101": String(idx + 1),
      "IT102": String(item.quantity || 0),
      "IT103": mapUnitToX12(item.unit || order.unit || "Meters"),
      "IT104": String(item.unitPrice || 0),
      "IT105": "PE",
      "IT106": "VP",
      "IT107": item.materialNo || `SKU-${(item.fabricType || "FAB").substring(0,3).toUpperCase()}`,
      "IT108": "EN",
      "IT109": item.productName || item.fabricType || "Fabric",
    })),
    "TDS": { "TDS01": String(totalAmount) },
    "CTT": {
      "CTT01": String(items.length),
      "CTT02": String(items.reduce((s, i) => s + (Number(i.quantity) || 0), 0))
    },
    "AMT": { "AMT01": "TT", "AMT02": String(totalAmount) },
    "SE": { "SE01": String(10 + items.length * 2), "SE02": "0001" },
    "GE": { "GE01": "1", "GE02": "1" },
    "IEA": { "IEA01": "1", "IEA02": controlNo }
  };
};

// ── Universal JSON → ANSI X12 translator ─────────────────────────────────────
// Converts any JSON payload into a readable ANSI X12-style flat string.
// Each top-level key becomes a segment, nested objects become sub-segments.
export const jsonToX12 = (ediCode, direction, payload) => {
  if (!payload) return "";
  const lines = [];
  const date  = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const time  = new Date().toISOString().replace(/[-:T]/g, '').slice(9, 13);
  const ctrl  = String(Math.floor(Math.random() * 999999999)).padStart(9, '0');

  const sender   = direction === "OUT" ? "HIRAYA         " : "MANUFACTURER   ";
  const receiver = direction === "OUT" ? "MANUFACTURER   " : "HIRAYA         ";

  // ISA envelope
  lines.push(`ISA*00*          *00*          *12*${sender}*12*${receiver}*${date}*${time}*U*00401*${ctrl}*0*P*>~`);
  lines.push(`GS*${ediCode}*${sender.trim()}*${receiver.trim()}*${date}*${time}*1*X*004010~`);
  lines.push(`ST*${ediCode}*0001~`);
  lines.push("");

  // Flatten the JSON payload into X12-style segments
  const flattenObj = (prefix, obj, depth = 0) => {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        if (typeof item === "object") {
          lines.push(`${prefix}${idx + 1}*${Object.values(item).map(v =>
            typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
          ).join("*")}~`);
        } else {
          lines.push(`${prefix}*${String(item)}~`);
        }
      });
    } else if (typeof obj === "object") {
      const values = Object.entries(obj);
      if (depth === 0) {
        // Top-level keys become segment identifiers
        values.forEach(([key, val]) => {
          if (val === null || val === undefined) return;
          if (Array.isArray(val)) {
            flattenObj(key.toUpperCase().slice(0, 4), val, depth + 1);
          } else if (typeof val === "object") {
            const inner = Object.values(val).map(v => String(v ?? "")).join("*");
            lines.push(`${key.toUpperCase().slice(0, 4)}*${inner}~`);
          } else {
            lines.push(`${key.toUpperCase().slice(0, 4)}*${String(val)}~`);
          }
        });
      }
    }
  };

  flattenObj("", payload, 0);

  lines.push("");
  lines.push(`SE*${lines.filter(l => l.endsWith("~")).length + 1}*0001~`);
  lines.push(`GE*1*1~`);
  lines.push(`IEA*1*${ctrl}~`);

  return lines.join("\n");
};

export const createEDIOrder = (orderData, segments) => {
  return { ...orderData, "EDI Transaction": segments };
};

// ── EDI 820 — Payment Remittance (Manufacturer → Hiraya) ─────────────────────
export const getX12_820 = (order) => {
  const edi820 = order.edi820 || {};
  return jsonToX12("820", "IN", {
    orderId:         order.id,
    poNumber:        order.poNumber || order.id,
    invoiceNumber:   edi820.invoiceNumber || `INV-${(order.poNumber || order.id || "").replace(/[^0-9]/g, "")}`,
    paymentAmount:   edi820.paymentAmount || order.totalAmount || 0,
    paymentMethod:   edi820.paymentMethod || "Bank Transfer",
    referenceNumber: edi820.referenceNumber || "",
    paymentDate:     edi820.paymentDate || order.updatedAt || new Date().toISOString(),
    paymentStatus:   "Paid",
  });
};

// ── EDI 997 — Functional Acknowledgement (Hiraya → Manufacturer) ─────────────
export const getX12_997 = (order) => {
  return jsonToX12("997", "OUT", {
    orderId:        order.id,
    poNumber:       order.poNumber || order.id,
    invoiceNumber:  `INV-${(order.poNumber || order.id || "").replace(/[^0-9]/g, "")}`,
    totalAmount:    order.totalAmount || 0,
    paymentStatus:  "Paid",
    acknowledgedAt: order.edi997SentAt || new Date().toISOString(),
    ackCode:        "A",  // A = Accepted
    transactionSet: "820",
  });
};

// ── EDI 855 — PO Acknowledgement (Hiraya → Manufacturer) ─────────────────────
export const getX12_855 = (order) => {
  const items = order.items?.length > 0 ? order.items : [{
    fabricType: order.fabricType, color: order.color, texture: order.texture,
    quantity: order.quantity, unit: order.unit || "Meters", unitPrice: order.unitPrice || 750,
  }];
  return jsonToX12("855", "OUT", {
    orderId:        order.id,
    poNumber:       order.poNumber || order.id,
    customer:       order.customer || order.customerName || "Vogue Manufacturing",
    status:         "Acknowledged",
    acknowledgedAt: order.updatedAt || new Date().toISOString(),
    items,
  });
};

// ── EDI 204 — Load Tender (Hiraya → CarGo) ────────────────────────────────────
export const getX12_204 = (order) => {
  const items = order.items?.length > 0 ? order.items : [{
    fabricType: order.fabricType, color: order.color, texture: order.texture,
    quantity: order.quantity, unit: order.unit || "Meters",
  }];
  return jsonToX12("204", "OUT", {
    orderId:               order.id,
    poNumber:              order.poNumber || order.id,
    shipmentId:            order.carrierShipmentId || order.shipmentId || `SHP-${order.id}`,
    shipDate:              order.updatedAt || new Date().toISOString(),
    estimatedDeliveryDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    carrier:               "CarGo",
    serviceType:           "LTL",
    items,
  });
};

// ── EDI 990 — Tender Accepted (CarGo → Hiraya) ───────────────────────────────
export const getX12_990 = (order) => {
  return jsonToX12("990", "IN", {
    orderId:         order.id,
    status:          "ACCEPTED",
    assignedVehicle: order.assignedVehicle || {},
    shipmentId:      order.carrierShipmentId || order.shipmentId || `SHP-${order.id}`,
  });
};

// ── EDI 214 — Shipment Status Update (CarGo → Hiraya) ────────────────────────
export const getX12_214 = (order, transitStatus) => {
  const status = transitStatus || order.transitStatus || "Pending";
  return jsonToX12("214", "IN", {
    shipmentId:  order.carrierShipmentId || order.shipmentId || `SHP-${order.id}`,
    status,
    location:    order.currentLocation || "—",
    description: order.lastDescription || "",
  });
};

// ── EDI 861 — Receiving Advice (Manufacturer → Hiraya) ───────────────────────
export const getX12_861 = (order) => {
  const ra = order.receivingAdvice || {};
  return jsonToX12("861", "IN", {
    orderId:       order.id,
    receivedAt:    ra.receivedAt || order.updatedAt || new Date().toISOString(),
    notes:         ra.notes || "",
    receivedItems: ra.receivedItems || [],
  });
};

// Legacy support (to avoid breaking components immediately)
export { getX12POSegments as formatX12PO, getX12InvoiceSegments as formatX12Invoice };

// segmentsToX12String — kept for backward compat with Orders.jsx
// For 850: pass getX12POSegments(order) result; for 810: pass getX12InvoiceSegments(order) result
export const segmentsToX12String = (segments) => {
  if (!segments || typeof segments !== "object") return "";
  const lines = [];
  const seg = (tag, obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    lines.push(`${tag}*${Object.values(obj).join("*")}~`);
  };
  const order = { id: "—" }; // placeholder — segments already built
  seg("ISA", segments.ISA);
  seg("GS",  segments.GS);
  seg("ST",  segments.ST);
  seg("BEG", segments.BEG);
  seg("BIG", segments.BIG);
  seg("REF", segments.REF);
  ["N1_SU","N3_SU","N4_SU","N1_BY","N3_BY","N4_BY","N1_SUP","N1_BUY"].forEach(k => {
    if (segments[k]) {
      const tag = k.startsWith("N1") ? "N1" : k.startsWith("N3") ? "N3" : "N4";
      seg(tag, segments[k]);
    }
  });
  seg("PER", segments.PER);
  if (Array.isArray(segments.PO1)) segments.PO1.forEach(i => seg("PO1", i));
  if (Array.isArray(segments.IT1)) segments.IT1.forEach(i => seg("IT1", i));
  seg("TDS", segments.TDS);
  seg("AMT", segments.AMT);
  seg("CTT", segments.CTT);
  seg("SE",  segments.SE);
  seg("GE",  segments.GE);
  seg("IEA", segments.IEA);
  return lines.filter(Boolean).join("\n");
};

export const pushToRealtimeDB = async () => true; // No-op as requested
export const listenToTransmissions = (cb) => { cb([]); return () => {}; };

