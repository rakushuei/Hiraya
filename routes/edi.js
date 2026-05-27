/**
 * routes/edi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * EDI Pipeline Technical Endpoints
 * Covers every business step from the EDI integration table:
 *
 *  Step              EDI Code  Method  Path
 *  ──────────────────────────────────────────────────────────────────────────
 *  Purchase Order      850     POST    /api/edi/receive/850   
 *  PO Acknowledgement  855     POST    /api/edi/import        
 *  Advance Ship Notice 856     POST    /api/edi/import        
 *  Pick Up             214     POST    /api/edi/import        
 *  In Transit          214     POST    /api/edi/import        
 *  Delivered           214     POST    /api/edi/import        
 *  Receiving Advice    861     POST    /api/edi/receive/861   
 *  Invoice             810     POST    /api/edi/import        
 *  Load Tender         204     POST    /api/edi/send-204      
 *  Carrier Webhook     990/214 POST    /api/edi/cargo/webhook 
 *
 * Mounted at: /api/edi
 */

import { Router } from "express";

const router = Router();

const RTDB_URL =
  "https://gen-lang-client-0250795173-default-rtdb.firebaseio.com/";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getOrder(id) {
  const res = await fetch(`${RTDB_URL}orders/${id}.json`);
  return res.ok ? res.json() : null;
}

async function saveOrder(id, data) {
  const res = await fetch(`${RTDB_URL}orders/${id}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`RTDB error ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/receive/850
// Receive a Purchase Order (EDI 850) from the Retailer
// Direction: Retailer → Bulldog
// ─────────────────────────────────────────────────────────────────────────────
router.post("/receive/850", async (req, res) => {
  try {
    const order = req.body;
    if (!order?.id) {
      return res.status(400).json({ error: "Field 'id' is required." });
    }

    const payload = {
      ...order,
      ediType: "850",
      workflowStep: order.workflowStep ?? 0,
      status: order.status || "Supplier Confirmation (855)",
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveOrder(order.id, payload);
    return res.status(201).json({
      success: true,
      message: "EDI 850 Purchase Order received.",
      order: saved,
    });
  } catch (err) {
    console.error("[EDI 850]", err.message);
    return res.status(500).json({ error: "Failed to process EDI 850.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/receive/861
// Receive a Receiving Advice (EDI 861) from the Retailer
// Direction: Retailer → Bulldog
// ─────────────────────────────────────────────────────────────────────────────
router.post("/receive/861", async (req, res) => {
  try {
    const { orderId, receivedItems, receivedAt, notes } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Field 'orderId' is required." });
    }

    const original = await getOrder(orderId);
    if (!original) return res.status(404).json({ error: `Order '${orderId}' not found.` });

    const updated = {
      ...original,
      status: "Receiving Advice (861)",
      workflowStep: 5,
      receivingAdvice: {
        ediType: "861",
        receivedItems: receivedItems || [],
        receivedAt: receivedAt || new Date().toISOString(),
        notes: notes || "",
      },
      updatedAt: new Date().toISOString(),
    };

    const result = await saveOrder(orderId, updated);
    return res.json({ success: true, message: "EDI 861 Receiving Advice processed.", order: result });
  } catch (err) {
    console.error("[EDI 861]", err.message);
    return res.status(500).json({ error: "Failed to process EDI 861.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/import
// Unified EDI intake — routes by ediType field
// Supported: 855, 856, 214, 810
// Direction: Retailer → Bulldog
// ─────────────────────────────────────────────────────────────────────────────
router.post("/import", async (req, res) => {
  try {
    const payload = req.body;
    const ediType = String(payload.ediType || "").trim();
    const resolvedId = payload.orderId || payload.poNumber || payload.id;

    if (!ediType) {
      return res.status(400).json({
        error: "Field 'ediType' is required. Accepted: 855, 856, 214, 810.",
      });
    }
    if (!resolvedId) {
      return res.status(400).json({
        error: "Provide 'orderId', 'poNumber', or 'id' to identify the order.",
      });
    }

    const original = await getOrder(resolvedId);
    if (!original) return res.status(404).json({ error: `Order '${resolvedId}' not found.` });

    let patch = {};

    switch (ediType) {
      // ── 855: PO Acknowledgement ───────────────────────────────────────────
      case "855":
        patch = {
          status: "PO Acknowledged (855)",
          workflowStep: 1,
          acknowledgement855: {
            ediType: "855",
            acknowledgedAt: payload.acknowledgedAt || new Date().toISOString(),
            acknowledgedBy: payload.acknowledgedBy || "Bulldog System",
            notes: payload.notes || "",
          },
        };
        break;

      // ── 856: Advance Ship Notice ──────────────────────────────────────────
      case "856":
        patch = {
          status: "Advance Ship Notice (856)",
          workflowStep: 2,
          advanceShipNotice856: {
            ediType: "856",
            shipmentId: payload.shipmentId || `SHP-${resolvedId}`,
            shipDate: payload.shipDate || new Date().toISOString(),
            estimatedDeliveryDate:
              payload.estimatedDeliveryDate ||
              new Date(Date.now() + 3 * 86400000).toISOString(),
            carrier: payload.carrier || "CarGo",
            trackingNumber: payload.trackingNumber || null,
            packages: payload.packages || [],
            items: payload.items || original.items || [],
          },
        };
        break;

      // ── 214: Shipment Status (Pick Up / In Transit / Delivered) ──────────
      case "214": {
        const statusMap = {
          PU: { status: "Pick Up (214)", workflowStep: 4 },
          IT: { status: "In Transit (214)", workflowStep: 4 },
          D:  { status: "Delivered (214)", workflowStep: 5 },
        };
        const sc = String(payload.statusCode || "IT").toUpperCase();
        const mapped = statusMap[sc] || {
          status: payload.statusDescription || "Shipment Status Update (214)",
          workflowStep: original.workflowStep,
        };
        patch = {
          status: mapped.status,
          workflowStep: mapped.workflowStep,
          shipmentStatus214: {
            ediType: "214",
            statusCode: sc,
            statusDescription: payload.statusDescription || mapped.status,
            location: payload.location || "Unknown",
            timestamp: payload.timestamp || new Date().toISOString(),
            carrierScac: payload.carrierScac || "CRGO",
            trackingNumber: payload.trackingNumber || null,
          },
        };
        break;
      }

      // ── 810: Invoice ──────────────────────────────────────────────────────
      case "810":
        patch = {
          status: "Invoice Received (810)",
          workflowStep: 6,
          invoice810: {
            ediType: "810",
            invoiceNumber: payload.invoiceNumber || `INV-${resolvedId}`,
            invoiceDate: payload.invoiceDate || new Date().toISOString(),
            totalAmount: payload.totalAmount || 0,
            lineItems: payload.lineItems || [],
            notes: payload.notes || "",
            receivedAt: new Date().toISOString(),
          },
        };
        break;

      default:
        return res.status(400).json({
          error: `Unsupported ediType '${ediType}'. Accepted: 855, 856, 214, 810.`,
        });
    }

    const updatedOrder = {
      ...original,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    const result = await saveOrder(resolvedId, updatedOrder);
    return res.json({
      success: true,
      message: `EDI ${ediType} imported successfully.`,
      ediType,
      orderId: resolvedId,
      newStatus: updatedOrder.status,
      workflowStep: updatedOrder.workflowStep,
      order: result,
    });
  } catch (err) {
    console.error("[EDI Import]", err.message);
    return res.status(500).json({ error: "Failed to import EDI document.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/send-204
// Dispatch a Load Tender (EDI 204) to CarGo Logistics
// Direction: Bulldog → CarGo
// ─────────────────────────────────────────────────────────────────────────────
router.post("/send-204", async (req, res) => {
  try {
    const { order } = req.body;
    if (!order) {
      return res.status(400).json({ error: "Field 'order' is required." });
    }

    // ── Load EDI config from Firebase (falls back to env / hardcoded defaults) ─
    let ediConfig = {};
    try {
      const cfgRes = await fetch(`${RTDB_URL}settings/edi.json`);
      if (cfgRes.ok) ediConfig = (await cfgRes.json()) || {};
    } catch (_) {}

    const logisticsApiKey =
      ediConfig.carrierApiKey ||
      process.env.LOGISTICS_API_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMDk0MGI4YWEyNzI4NTc4OTUwZmVhNSIsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3NzkyMzc2ODEsImV4cCI6MTc3OTMyNDA4MX0.f0zzRNbtlkveNunA03woPmeVPkXlSeGwIvHkX0vp_OI";

    const logisticsUrl =
      ediConfig.carrierApiUrl ||
      process.env.LOGISTICS_PARTNER_API_URL ||
      "https://grip-faceplate-alienate.ngrok-free.dev/api/loadtenders";

    const isaId       = ediConfig.isaId       || "Hiraya";
    const shipperName = ediConfig.shipperName  || "Hiraya";
    const carrierId   = ediConfig.carrierId    || "CRGO";
    const carrierName = ediConfig.carrierName  || "CarGo";
    const carrierScac = ediConfig.carrierScac  || "CRGO";
    const serviceType = ediConfig.serviceType  || "LTL";

    const originName    = ediConfig.warehouseName    || "Main Warehouse";
    const originAddress = ediConfig.warehouseAddress || "148 Industrial Ave, Sector 4";
    const originCity    = ediConfig.warehouseCity    || "Manila";
    const originState   = ediConfig.warehouseState   || "NCR";
    const originPostal  = ediConfig.warehousePostal  || "1000";
    const contactPerson = ediConfig.contactPerson    || "Drich";
    const contactPhone  = ediConfig.contactPhone     || "0917-123-4567";

    // Resolve destination from deliveryCity string
    let cleanDestCity = "Calamba", destState = "IVA", destPostal = "4027";
    if (order.deliveryCity) {
      const c = order.deliveryCity.toLowerCase();
      if (c.includes("manila"))                          { cleanDestCity = "Manila";    destState = "NCR"; destPostal = "1000"; }
      else if (c.includes("antipolo"))                   { cleanDestCity = "Antipolo";  destState = "IVA"; destPostal = "1870"; }
      else if (c.includes("cavite") || c.includes("dasmarinas")) { cleanDestCity = "Dasmarinas"; destState = "IVA"; destPostal = "4114"; }
      else if (c.includes("calamba") || c.includes("laguna"))    { cleanDestCity = "Calamba";    destState = "IVA"; destPostal = "4027"; }
      else if (c.includes("cebu"))                       { cleanDestCity = "Cebu";      destState = "VII"; destPostal = "6000"; }
      else {
        const parts = order.deliveryCity.split(",").map(p => p.trim().replace(/[^a-zA-Z\s]/g, ""));
        cleanDestCity = parts.find(p => p && p !== "Philippines") || "Calamba";
        destState = "IVA"; destPostal = "4000";
      }
    }

    // ── Calculate weight, volume & pallets from actual order items ───────────
    // Formula: weight_kg = (qty_meters × width_m × gsm) / 1000
    // Volume:  cbm = qty_meters × width_m × avg_thickness_m (0.003m ≈ 3mm folded)
    // Pallets: 1 pallet per 500 kg, minimum 1

    // GSM defaults keyed by fabric type (used when RTDB fabric record not found)
    const GSM_DEFAULTS = {
      cotton:    180, denim:   400, polyester: 120, linen:  250,
      silk:       80, canvas:  450, satin:     100, wool:   300,
      default:   200,
    };
    // Width defaults in cm
    const WIDTH_DEFAULTS = {
      cotton:    150, denim:   140, polyester: 160, linen:  150,
      silk:      110, canvas:  160, satin:     140, wool:   150,
      default:   150,
    };

    // Fetch fabric catalog once to look up real GSM/width values
    let fabricCatalog = {};
    try {
      const fabRes = await fetch(`${RTDB_URL}fabrics.json`);
      if (fabRes.ok) fabricCatalog = (await fabRes.json()) || {};
    } catch (_) {}

    // Normalise items — fall back to single-item order fields
    const orderItems = (order.items && order.items.length > 0)
      ? order.items
      : [{
          fabricType: order.fabricType || "Canvas",
          color:      order.color      || "Khaki",
          texture:    order.texture    || "Heavy",
          quantity:   Number(order.quantity) || 100,
          unit:       order.unit       || "Meters",
        }];

    // Convert any unit to meters
    const toMeters = (qty, unit = "Meters") => {
      const u = (unit || "Meters").toLowerCase();
      if (u === "yards" || u === "yds") return qty * 0.9144;
      if (u === "rolls")                return qty * 100;   // 1 roll ≈ 100 m
      return qty; // already meters
    };

    let totalWeightKg  = 0;
    let totalVolumeCbm = 0;

    for (const item of orderItems) {
      const qtyMeters = toMeters(Number(item.quantity) || 0, item.unit);
      const typeKey   = (item.fabricType || "default").toLowerCase();

      // Try to find a matching fabric in the catalog for real GSM/width
      const catalogMatch = Object.values(fabricCatalog).find(f =>
        f.type?.toLowerCase()    === typeKey &&
        f.color?.toLowerCase()   === (item.color  || "").toLowerCase() &&
        f.texture?.toLowerCase() === (item.texture || "").toLowerCase()
      ) || Object.values(fabricCatalog).find(f =>
        f.type?.toLowerCase() === typeKey
      );

      const gsm   = catalogMatch?.gsm   || GSM_DEFAULTS[typeKey]   || GSM_DEFAULTS.default;
      const widthCm = catalogMatch?.width || WIDTH_DEFAULTS[typeKey] || WIDTH_DEFAULTS.default;
      const widthM  = widthCm / 100;

      // weight (kg) = length_m × width_m × gsm / 1000
      const itemWeightKg = qtyMeters * widthM * gsm / 1000;
      // volume (cbm) = length_m × width_m × 0.003 m (≈ folded fabric thickness per layer)
      const itemVolumeCbm = qtyMeters * widthM * 0.003;

      totalWeightKg  += itemWeightKg;
      totalVolumeCbm += itemVolumeCbm;
    }

    // Add 5% packaging buffer and round sensibly
    totalWeightKg  = Math.ceil(totalWeightKg  * 1.05);
    totalVolumeCbm = Math.round(totalVolumeCbm * 1.05 * 100) / 100;

    // 1 pallet per 500 kg, minimum 1
    const palletCount = Math.max(1, Math.ceil(totalWeightKg / 500));

    // Format weight string — always in kg
    const formattedWeight = `${totalWeightKg}kg`;

    console.log(`[EDI 204] Calculated — weight: ${totalWeightKg}kg (${formattedWeight}), volume: ${totalVolumeCbm}cbm, pallets: ${palletCount}`);

    const payload = {
      isaId: isaId,
      orderId: order.id,
      poNumber: order.poNumber || order.id,
      customerName: order.customerName || order.customer || "Vogue Manufacturing Plant",
      shipper: shipperName,
      carrierId,
      carrierName,
      carrierScac,
      serviceType,
      palletCount,
      totalWeightKg,
      totalVolumeCbm,
      estimatedFreightCost: 2500,
      weight: formattedWeight,
      commodity: (order.items || []).map(i => i.productName || i.materialName || "Canvas Fabric").join(", ") || "Canvas Fabric",
      origin: { name: originName, address: originAddress, city: originCity, state: originState, postalCode: originPostal },
      destination: { name: order.deliveryName || "Vogue Manufacturing Plant", address: order.deliveryAddress || "FCIE Compound, Governors Drive", city: cleanDestCity, state: destState, postalCode: destPostal },
      originAddress: { name: originName, locationName: originName, street: originAddress, address: originAddress, city: originCity, state: originState, region: originState, postalCode: originPostal, zipCode: originPostal, contactPerson, contactPhone },
      destinationAddress: { name: order.deliveryName || "Vogue Manufacturing Plant", locationName: order.deliveryName || "Vogue Manufacturing Plant", street: order.deliveryAddress || "FCIE Compound, Governors Drive", address: order.deliveryAddress || "FCIE Compound, Governors Drive", city: cleanDestCity, state: destState, region: destState, postalCode: destPostal, zipCode: destPostal, contactPerson: order.contactPerson || "Supplier Coordinator", contactPhone: order.contactPhone || "0918-765-4321" },
      items: (order.items || []).map(item => ({ name: item.productName || item.materialName || "Canvas Fabric", quantity: Number(item.quantity) || 100, unit: item.unit || "Yards", color: item.color || "Khaki", texture: item.texture || "Heavy" })),
      date: new Date().toISOString(),
      pickupDate: new Date(Date.now() + 86400000).toISOString(),
      deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      estimatedDeliveryDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    };

    console.log("[EDI 204] Dispatching Load Tender to CarGo:", payload.orderId);

    // 10-second timeout — CarGo on Vercel can cold-start slowly
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(logisticsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EDI 204] CarGo returned ${response.status}:`, errorText);
      // Still return success to the UI — the load tender was built and sent.
      // The order is saved; CarGo will webhook back when ready.
      return res.status(202).json({
        success: true,
        message: `Load Tender submitted. CarGo responded with ${response.status} — awaiting acknowledgement.`,
        cargoStatus: response.status,
        cargoError: errorText,
        payload,
      });
    }

    const data = await response.json();
    console.log("[EDI 204] CarGo booking confirmed:", data);
    return res.json({ success: true, message: "EDI 204 Load Tender dispatched.", data });
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[EDI 204] CarGo request timed out after 10s");
      // Return 202 so the UI doesn't show an error — the tender was built,
      // CarGo may still process it and webhook back later.
      return res.status(202).json({
        success: true,
        message: "Load Tender sent but CarGo took too long to respond. Awaiting webhook callback.",
        timeout: true,
      });
    }
    console.error("[EDI 204]", err.message);
    return res.status(500).json({ error: "Failed to dispatch EDI 204.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/214
// Receive EDI 214 Shipment Status Update from Logistics
// Direction: CarGo → Bulldog
//
// Payload: { "shipmentId": "", "status": "", "location": "", "description": "" }
// Status values: PICKUP | IN_TRANSIT | DELIVERED  (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/214", async (req, res) => {
  try {
    console.log("[EDI 214] Received:", JSON.stringify(req.body));

    const { shipmentId, status, location, description } = req.body;

    if (!shipmentId) {
      return res.status(400).json({ error: "Field 'shipmentId' is required." });
    }
    if (!status) {
      return res.status(400).json({ error: "Field 'status' is required." });
    }

    // ── Find the order by shipmentId ─────────────────────────────────────────
    const allRes = await fetch(`${RTDB_URL}orders.json`);
    const allOrders = await allRes.json();

    if (!allOrders) {
      return res.status(404).json({ error: "No orders found in system." });
    }

    const match = Object.entries(allOrders).find(([, o]) =>
      o.carrierShipmentId === shipmentId ||
      o.shipmentId        === shipmentId ||
      o.advanceShipNotice856?.shipmentId === shipmentId
    );

    // Fallback: if no shipmentId stored yet (990 came without one), match the
    // most recent order at step 3 (Shipment Dispatched) that has no carrierShipmentId.
    // This handles logistics systems that only send the shipmentId in the first 214.
    const resolvedMatch = match || Object.entries(allOrders)
      .filter(([, o]) => o.workflowStep === 3 && !o.carrierShipmentId)
      .sort((a, b) => new Date(b[1].updatedAt || 0) - new Date(a[1].updatedAt || 0))[0];

    if (!resolvedMatch) {
      return res.status(404).json({
        error: `No order found with shipmentId '${shipmentId}'.`,
        hint:  "Make sure the 990 acceptance was sent first. If the 990 had no shipmentId, the order must be at step 3.",
      });
    }

    const [orderId, original] = resolvedMatch;
    console.log(`[EDI 214] Matched shipmentId '${shipmentId}' → orderId '${orderId}'`);

    // ── Map status to transitStatus ──────────────────────────────────────────
    const rawStatus = status.toLowerCase().trim();

    let transitStatus;
    if (rawStatus === "pickup" || rawStatus === "pick_up" || rawStatus === "picked_up" || rawStatus.includes("pick")) {
      transitStatus = "Pickup";
    } else if (rawStatus === "in_transit" || rawStatus === "in transit" || rawStatus === "dispatched" || rawStatus.includes("transit") || rawStatus.includes("dispatch")) {
      transitStatus = "In Transit";
    } else if (rawStatus === "delivered" || rawStatus === "completed" || rawStatus === "arrived" || rawStatus.includes("deliver") || rawStatus.includes("complet")) {
      transitStatus = "Delivered";
    } else {
      return res.status(400).json({
        error: `Unknown status '${status}'. Use: PICKUP, IN_TRANSIT, or DELIVERED.`,
      });
    }

    const updatedOrder = {
      ...original,
      status:            transitStatus === "Delivered" ? "Delivered" : "Transit Status Updates (214)",
      workflowStep:      transitStatus === "Delivered" ? 5 : 4,
      transitStatus,
      // Always store the shipmentId so future 214s can match by it
      carrierShipmentId: original.carrierShipmentId || shipmentId,
      shipmentId:        original.shipmentId        || shipmentId,
      currentLocation:   location    || original.currentLocation || "Unknown",
      lastDescription:   description || "",
      lastEdi214At:      new Date().toISOString(),
      ...(transitStatus === "Delivered" ? { carrierDeliveredAt: new Date().toISOString() } : {}),
      updatedAt:         new Date().toISOString(),
    };

    await saveOrder(orderId, updatedOrder);

    console.log(`[EDI 214] ✅ Order '${orderId}' transitStatus → '${transitStatus}' @ '${location}'`);
    return res.json({
      success:       true,
      message:       `EDI 214 processed. Transit status set to '${transitStatus}'.`,
      orderId,
      shipmentId,
      transitStatus,
      location:      location || "",
      workflowStep:  4,
    });
  } catch (err) {
    console.error("[EDI 214]", err.message);
    return res.status(500).json({ error: "Failed to process EDI 214.", details: err.message });
  }
});

// Receive carrier status callbacks (EDI 990 / 214)
// Direction: CarGo → Bulldog
//
// EDI 990 payload (accepted): { "orderId": "", "status": "ACCEPTED", "assignedVehicle": { "vehicleId": "", "name": "", "type": "", "plate": "" } }
// EDI 990 payload (rejected): { "orderId": "", "status": "REJECTED", "notes": "" }
// EDI 214 payload: { "shipmentId": "", "status": "DELIVERED", "location": "", "description": "" }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/cargo/webhook", async (req, res) => {
  try {
    console.log("[Webhook] CarGo callback received:", JSON.stringify(req.body));

    const payload = req.body || {};

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        error: "Request body is empty.",
        hint: "Set Content-Type: application/json and send the JSON in the request body.",
      });
    }

    // ── Normalise status (CarGo sends uppercase e.g. "DELIVERED") ────────────
    const rawStatus = String(payload.status || payload.event || "").toLowerCase().trim();
    console.log(`[Webhook] rawStatus='${rawStatus}'`);

    // ── Resolve order ─────────────────────────────────────────────────────────
    // EDI 990 sends orderId. EDI 214 sends shipmentId — scan all orders to match.
    let orderId  = payload.orderId || payload.poNumber || payload.id;
    let original = null;

    if (orderId) {
      original = await getOrder(orderId);
    }

    // Fallback: match by shipmentId stored on the order (set during 990 acceptance)
    if (!original && payload.shipmentId) {
      console.log(`[Webhook] No orderId — searching by shipmentId='${payload.shipmentId}'...`);
      const allRes = await fetch(`${RTDB_URL}orders.json`);
      const allOrders = await allRes.json();
      if (allOrders) {
        const match = Object.entries(allOrders).find(([, o]) =>
          o.carrierShipmentId === payload.shipmentId ||
          o.shipmentId        === payload.shipmentId ||
          o.advanceShipNotice856?.shipmentId === payload.shipmentId
        );
        // Secondary fallback: most recent step-3 order with no carrierShipmentId
        const resolved = match || Object.entries(allOrders)
          .filter(([, o]) => o.workflowStep === 3 && !o.carrierShipmentId)
          .sort((a, b) => new Date(b[1].updatedAt || 0) - new Date(a[1].updatedAt || 0))[0];
        if (resolved) {
          orderId  = resolved[0];
          original = resolved[1];
          console.log(`[Webhook] Matched shipmentId '${payload.shipmentId}' → orderId '${orderId}'`);
        }
      }
    }

    if (!orderId || !original) {
      console.warn("[Webhook] Could not resolve order. Payload:", payload);
      return res.status(404).json({
        error: "Cannot find order matching this payload.",
        hint:  "For EDI 990 send 'orderId'. For EDI 214 send 'shipmentId' that was stored during 990 acceptance.",
        receivedPayload: payload,
      });
    }

    let updatedStatus = original.status;
    let updatedStep   = original.workflowStep;
    let extraData     = {};

    // ── EDI 990 — Accepted ────────────────────────────────────────────────────
    if (
      rawStatus === "acknowledged" || rawStatus === "accepted" ||
      rawStatus === "approved"     || rawStatus === "confirmed" ||
      rawStatus.includes("accept") || rawStatus.includes("acknowledg")
    ) {
      updatedStatus = "Shipment Dispatched (856)";
      updatedStep   = 3;

      // assignedVehicle can be an object {vehicleId, name, type, plate} or a plain string
      const vehicle = payload.assignedVehicle || null;
      const plateNumber = typeof vehicle === "object"
        ? vehicle?.plate || payload.plateNumber || null
        : payload.plateNumber || null;

      extraData = {
        carrierAcceptedAt:        new Date().toISOString(),
        assignedVehicle:          vehicle,
        plateNumber,
        freightTotalAmount:       payload.totalAmount        || null,
        carrierEstimatedDelivery: payload.estimatedDeliveryDate || null,
        // Always overwrite with the shipmentId from this 990 payload — this is
        // the authoritative ID CarGo will use for all subsequent 214 updates.
        carrierShipmentId:        payload.shipmentId || null,
        shipmentId:               payload.shipmentId || null,
      };

    // ── EDI 990 — Rejected ────────────────────────────────────────────────────
    } else if (
      rawStatus === "rejected" || rawStatus === "declined" ||
      rawStatus.includes("reject") || rawStatus.includes("decline")
    ) {
      updatedStatus = "Carrier Rejected (990)";
      extraData = {
        carrierRejectedAt: new Date().toISOString(),
        declineReason: payload.notes || payload.declineReason || payload.reason || payload.description || "Carrier rejected load tender",
      };

    // ── EDI 214 — Pick Up ─────────────────────────────────────────────────────
    } else if (
      rawStatus === "pickup" || rawStatus === "picked_up" || rawStatus === "pick_up" ||
      rawStatus.includes("pick")
    ) {
      updatedStatus = "Transit Status Updates (214)";
      updatedStep   = 4;
      extraData = {
        carrierPickupAt:   new Date().toISOString(),
        currentLocation:   payload.location || "Origin Warehouse",
        transitStatus:     "Pickup",
        lastDescription:   payload.description || "",
        // Store shipmentId on first 214 so future lookups work
        carrierShipmentId: original.carrierShipmentId || payload.shipmentId || null,
        shipmentId:        original.shipmentId        || payload.shipmentId || null,
      };

    // ── EDI 214 — In Transit ──────────────────────────────────────────────────
    } else if (
      rawStatus === "dispatched" || rawStatus === "shipped"   ||
      rawStatus === "in_transit" || rawStatus === "in transit" ||
      rawStatus === "out_for_delivery" ||
      rawStatus.includes("transit") || rawStatus.includes("dispatch") || rawStatus.includes("ship")
    ) {
      updatedStatus = "Transit Status Updates (214)";
      updatedStep   = 4;
      extraData = {
        carrierTransitUpdateAt: new Date().toISOString(),
        currentLocation:   payload.location || "In Transit",
        transitStatus:     "In Transit",
        lastDescription:   payload.description || "",
        carrierShipmentId: original.carrierShipmentId || payload.shipmentId || null,
        shipmentId:        original.shipmentId        || payload.shipmentId || null,
      };

    // ── EDI 214 — Delivered ───────────────────────────────────────────────────
    } else if (
      rawStatus === "delivered" || rawStatus === "completed" || rawStatus === "arrived" ||
      rawStatus.includes("deliver") || rawStatus.includes("complet") || rawStatus.includes("arriv")
    ) {
      updatedStatus = "Delivered";
      updatedStep   = 5;
      extraData = {
        carrierDeliveredAt: new Date().toISOString(),
        currentLocation:    payload.location || "Destination",
        transitStatus:      "Delivered",
        lastDescription:    payload.description || "",
        carrierShipmentId:  original.carrierShipmentId || payload.shipmentId || null,
        shipmentId:         original.shipmentId        || payload.shipmentId || null,
      };

    } else {
      console.warn(`[Webhook] Unrecognised status '${rawStatus}' for order '${orderId}'. No change.`);
      return res.json({
        success: true,
        message: `Webhook received but status '${rawStatus}' did not match any known EDI state. No change applied.`,
        orderId,
        receivedStatus: rawStatus,
      });
    }

    const updatedOrder = {
      ...original,
      status:       updatedStatus,
      workflowStep: updatedStep,
      updatedAt:    new Date().toISOString(),
      ...extraData,
    };

    await saveOrder(orderId, updatedOrder);

    console.log(`[Webhook] ✅ Order '${orderId}' → '${updatedStatus}' (step ${updatedStep})`);
    return res.json({
      success:      true,
      message:      "Carrier callback processed successfully.",
      orderId,
      newStatus:    updatedStatus,
      workflowStep: updatedStep,
    });
  } catch (err) {
    console.error("[Webhook] Error:", err.message);
    return res.status(500).json({ error: "Failed to process webhook.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/send-freight-invoice
// Send freight invoice payment to CarGo Logistics
// Direction: Hiraya → CarGo
//
// Payload from UI: { orderId, shipmentId, invoiceNumber, totalAmount, taxAmount }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/send-freight-invoice", async (req, res) => {
  try {
    const { orderId, shipmentId, invoiceNumber, totalAmount, taxAmount } = req.body;

    if (!shipmentId)    return res.status(400).json({ error: "Field 'shipmentId' is required." });
    if (!invoiceNumber) return res.status(400).json({ error: "Field 'invoiceNumber' is required." });
    if (!totalAmount)   return res.status(400).json({ error: "Field 'totalAmount' is required." });

    // Load EDI config from Firebase for the base URL
    let ediConfig = {};
    try {
      const cfgRes = await fetch(`${RTDB_URL}settings/edi.json`);
      if (cfgRes.ok) ediConfig = (await cfgRes.json()) || {};
    } catch (_) {}

    // Derive freight invoice URL from the carrier API base URL
    const carrierBase = (ediConfig.carrierApiUrl || "https://grip-faceplate-alienate.ngrok-free.dev/api/loadtenders")
      .replace(/\/api\/loadtenders.*$/, "");
    const freightInvoiceUrl = ediConfig.freightInvoiceApiUrl || `${carrierBase}/api/invoices`;

    const payload = {
      shipmentId,
      invoiceNumber,
      totalAmount: Number(totalAmount),
      taxAmount:   Number(taxAmount || 0),
    };

    console.log("[Freight Invoice] Sending to CarGo:", freightInvoiceUrl, payload);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(freightInvoiceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Freight Invoice] CarGo returned ${response.status}:`, errText);
      return res.status(202).json({
        success: true,
        message: `Freight invoice submitted. CarGo responded with ${response.status}.`,
        cargoStatus: response.status,
        cargoError: errText,
        payload,
      });
    }

    const data = await response.json();
    console.log("[Freight Invoice] CarGo confirmed:", data);
    return res.json({ success: true, message: "Freight invoice sent to CarGo.", data, payload });

  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(202).json({
        success: true,
        message: "Freight invoice sent but CarGo took too long to respond.",
        timeout: true,
      });
    }
    console.error("[Freight Invoice]", err.message);
    return res.status(500).json({ error: "Failed to send freight invoice.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/receive/freight-invoice
// Receive a Freight Invoice (EDI 210) from the Logistics provider (CarGo)
// Direction: CarGo → Hiraya
//
// Payload: { "shipmentId": "SHP-792199", "invoiceId": "INV-0098",
//            "totalAmount": 616, "dueDate": "2026-06-15", "status": "Pending" }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/receive/freight-invoice", async (req, res) => {
  try {
    const { shipmentId, invoiceId, status, totalAmount, dueDate } = req.body;

    if (!shipmentId) return res.status(400).json({ error: "Field 'shipmentId' is required." });
    if (!invoiceId)  return res.status(400).json({ error: "Field 'invoiceId' is required." });
    if (totalAmount === undefined || totalAmount === null)
      return res.status(400).json({ error: "Field 'totalAmount' is required." });

    const recordId = invoiceId.replace(/[^a-zA-Z0-9-_]/g, "_");
    const record = {
      invoiceId,
      shipmentId,
      status:      status || "Pending",
      totalAmount: Number(totalAmount),
      dueDate:     dueDate || null,
      receivedAt:  new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };

    // Persist to freightInvoices node in RTDB
    const saveRes = await fetch(`${RTDB_URL}freightInvoices/${recordId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!saveRes.ok) throw new Error(`RTDB error ${saveRes.status}`);
    const saved = await saveRes.json();

    console.log(`[Freight Invoice] Received from logistics: invoiceId='${invoiceId}' shipmentId='${shipmentId}' amount=${totalAmount} dueDate=${dueDate}`);
    return res.status(201).json({
      success: true,
      message: "Freight invoice received and recorded.",
      invoice: saved,
    });
  } catch (err) {
    console.error("[Freight Invoice Receive]", err.message);
    return res.status(500).json({ error: "Failed to record freight invoice.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/freight-invoice/paid
// Receive a payment confirmation webhook from Logistics (CarGo)
// Direction: CarGo → Hiraya
//
// Payload: { "shipmentId": "SHP-1779291383497", "paymentStatus": "PAID" }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/freight-invoice/paid", async (req, res) => {
  try {
    const { shipmentId, paymentStatus } = req.body;

    if (!shipmentId)    return res.status(400).json({ error: "Field 'shipmentId' is required." });
    if (!paymentStatus) return res.status(400).json({ error: "Field 'paymentStatus' is required." });

    const normalised = paymentStatus.toUpperCase().trim();
    if (normalised !== "PAID") {
      return res.status(400).json({ error: `Unsupported paymentStatus '${paymentStatus}'. Expected 'PAID'.` });
    }

    // Find the matching freight invoice by shipmentId
    const listRes = await fetch(`${RTDB_URL}freightInvoices.json`);
    const allInvoices = await listRes.json();

    if (!allInvoices) {
      return res.status(404).json({ error: "No freight invoices found in system." });
    }

    const match = Object.entries(allInvoices).find(([, inv]) => inv.shipmentId === shipmentId);
    if (!match) {
      return res.status(404).json({
        error: `No freight invoice found for shipmentId '${shipmentId}'.`,
        hint:  "Make sure the invoice was received via POST /api/edi/receive/freight-invoice first.",
      });
    }

    const [recordId, existing] = match;
    const updated = {
      ...existing,
      status:  "Paid",
      paidAt:  new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saveRes = await fetch(`${RTDB_URL}freightInvoices/${recordId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!saveRes.ok) throw new Error(`RTDB error ${saveRes.status}`);
    const saved = await saveRes.json();

    console.log(`[Freight Invoice Paid] shipmentId='${shipmentId}' invoiceId='${existing.invoiceId}' → Paid`);
    return res.json({
      success:   true,
      message:   "Freight invoice marked as Paid.",
      invoiceId: existing.invoiceId,
      shipmentId,
      invoice:   saved,
    });
  } catch (err) {
    console.error("[Freight Invoice Paid]", err.message);
    return res.status(500).json({ error: "Failed to update freight invoice payment.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/freight-invoice/receipt
// Receive a payment receipt (PDF URL) from Logistics after payment is confirmed
// Direction: CarGo → Hiraya
//
// Payload: { "shipmentId": "SHP-0001",
//            "pdfUrl": "https://grip-faceplate-alienate.ngrok-free.dev/api/invoices/pdf/<token>" }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/freight-invoice/receipt", async (req, res) => {
  try {
    const { shipmentId, pdfUrl } = req.body;

    if (!shipmentId) return res.status(400).json({ error: "Field 'shipmentId' is required." });
    if (!pdfUrl)     return res.status(400).json({ error: "Field 'pdfUrl' is required." });

    // Find the matching freight invoice by shipmentId
    const listRes = await fetch(`${RTDB_URL}freightInvoices.json`);
    const allInvoices = await listRes.json();

    if (!allInvoices) {
      return res.status(404).json({ error: "No freight invoices found in system." });
    }

    const match = Object.entries(allInvoices).find(([, inv]) => inv.shipmentId === shipmentId);
    if (!match) {
      return res.status(404).json({
        error: `No freight invoice found for shipmentId '${shipmentId}'.`,
        hint:  "Make sure the invoice was received via POST /api/edi/receive/freight-invoice first.",
      });
    }

    const [recordId, existing] = match;
    const updated = {
      ...existing,
      pdfUrl,
      receiptReceivedAt: new Date().toISOString(),
      updatedAt:         new Date().toISOString(),
    };

    const saveRes = await fetch(`${RTDB_URL}freightInvoices/${recordId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!saveRes.ok) throw new Error(`RTDB error ${saveRes.status}`);
    const saved = await saveRes.json();

    console.log(`[Freight Receipt] shipmentId='${shipmentId}' pdfUrl saved → invoiceId='${existing.invoiceId}'`);
    return res.json({
      success:   true,
      message:   "Freight invoice receipt (PDF) saved.",
      invoiceId: existing.invoiceId,
      shipmentId,
      pdfUrl,
      invoice:   saved,
    });
  } catch (err) {
    console.error("[Freight Receipt]", err.message);
    return res.status(500).json({ error: "Failed to save freight invoice receipt.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/receive/820
// Receive a Payment Order (EDI 820) from the Manufacturer (Buyer → Seller)
// Direction: Manufacturer → Hiraya
//
// Payload:
// {
//   "orderId":       "SO-PO-001",          // required — Hiraya order ID
//   "poNumber":      "PO-001",             // optional fallback identifier
//   "invoiceNumber": "INV-001",            // optional reference
//   "paymentAmount": 750000,               // amount being paid in this remittance
//   "paymentMethod": "Bank Transfer",      // optional — e.g. Bank Transfer, Check, GCash
//   "referenceNumber": "REF-20260523-001", // optional — bank/payment reference
//   "paymentDate":   "2026-05-23T10:00:00.000Z" // optional — defaults to now
// }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/receive/820", async (req, res) => {
  try {
    const {
      orderId,
      poNumber,
      invoiceNumber,
      paymentAmount,
      paymentMethod,
      referenceNumber,
      paymentDate,
    } = req.body;

    // Resolve the order — try orderId first, then poNumber
    const resolvedId = orderId || poNumber;
    if (!resolvedId) {
      return res.status(400).json({
        error: "Provide 'orderId' or 'poNumber' to identify the order.",
      });
    }
    if (paymentAmount === undefined || paymentAmount === null) {
      return res.status(400).json({ error: "Field 'paymentAmount' is required." });
    }

    let order = await getOrder(resolvedId);

    // Fallback: scan all orders and match by poNumber
    if (!order && poNumber) {
      const allRes = await fetch(`${RTDB_URL}orders.json`);
      const allOrders = await allRes.json();
      if (allOrders) {
        const match = Object.entries(allOrders).find(
          ([, o]) => o.poNumber === poNumber || o.id === poNumber
        );
        if (match) order = match[1];
      }
    }

    if (!order) {
      return res.status(404).json({
        error: `Order '${resolvedId}' not found.`,
        hint: "Make sure the orderId matches the Hiraya SO number (e.g. SO-PO-001).",
      });
    }

    const paidAt      = paymentDate || new Date().toISOString();

    // Use the payment amount as the total if no totalAmount is stored on the order
    const storedTotal = order.totalAmount ||
      (order.items || []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

    // If no reliable total exists, treat the payment as full payment
    const totalAmount = storedTotal > 0 ? storedTotal : Number(paymentAmount);

    const alreadyPaid   = Number(order.amountPaid || 0);
    const newAmountPaid = alreadyPaid + Number(paymentAmount);
    const newStatus     = newAmountPaid >= totalAmount ? "Paid" : "Not Paid";

    const resolvedInvoiceNumber = invoiceNumber ||
      `INV-${(order.poNumber || order.id || "").replace(/[^0-9]/g, "")}`;

    const updatedOrder = {
      ...order,
      paymentStatus:   newStatus,
      amountPaid:      newAmountPaid,
      totalAmount:     totalAmount || Number(paymentAmount),
      workflowStep:    newStatus === "Paid" ? 7 : Math.max(order.workflowStep || 0, 6),
      status:          newStatus === "Paid" ? "Fulfillment Complete" : order.status,
      edi820: {
        ediType:         "820",
        invoiceNumber:   resolvedInvoiceNumber,
        paymentAmount:   Number(paymentAmount),
        paymentMethod:   paymentMethod || "Bank Transfer",
        referenceNumber: referenceNumber || null,
        paymentDate:     paidAt,
        receivedAt:      new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveOrder(order.id || resolvedId, updatedOrder);

    // ── Auto-send EDI 810 Invoice to manufacturer when payment is confirmed ──
    if (newStatus === "Paid") {
      const invoicePayload = {
        orderId:       order.id || resolvedId,
        poNumber:      order.poNumber || order.id,
        invoiceNumber: resolvedInvoiceNumber,
        invoiceDate:   new Date().toISOString(),
        totalAmount,
        paymentStatus: "Paid",
        items: (order.items || []).map(i => ({
          description: i.fabricType || i.productName || "Fabric",
          quantity:    i.quantity,
          unit:        i.unit || "Meters",
          unitPrice:   i.unitPrice || 750,
          lineTotal:   (Number(i.quantity) || 0) * (Number(i.unitPrice) || 750),
        })),
      };

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      try {
        await fetch("https://gilled-operable-jingle.ngrok-free.dev/api/edi/receive-810", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify(invoicePayload),
          signal: controller.signal,
        });
        console.log(`[EDI 820→810] Auto-sent invoice to manufacturer for order '${order.id || resolvedId}'`);
      } catch (e) {
        console.warn(`[EDI 820→810] Could not auto-send 810 (non-fatal):`, e.message);
      } finally {
        clearTimeout(tid);
      }
    }

    console.log(`[EDI 820] Payment received — orderId='${order.id}' amount=${paymentAmount} status=${newStatus}`);
    return res.json({
      success:       true,
      message:       `EDI 820 Payment Remittance processed. Status: ${newStatus}.`,
      orderId:       order.id || resolvedId,
      paymentAmount: Number(paymentAmount),
      totalAmount,
      amountPaid:    newAmountPaid,
      paymentStatus: newStatus,
      workflowStep:  updatedOrder.workflowStep,
    });
  } catch (err) {
    console.error("[EDI 820]", err.message);
    return res.status(500).json({ error: "Failed to process EDI 820.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/edi/proxy-manufacturer
// Server-side proxy to forward EDI calls to the manufacturer's ngrok endpoint.
// Avoids CORS — browser calls this, server calls the manufacturer.
// Body: { endpoint: "receive-856", body: { ...payload } }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/proxy-manufacturer", async (req, res) => {
  const MANUFACTURER_BASE = "https://rejoicing-exposable-destitute.ngrok-free.dev/api/edi";
  const { endpoint, body } = req.body;

  if (!endpoint) return res.status(400).json({ error: "Field 'endpoint' is required." });

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${MANUFACTURER_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log(`[Proxy → Manufacturer] ${endpoint} → ${response.status}`);
    return res.status(response.ok ? 200 : 202).json({
      success: response.ok,
      status:  response.status,
      data,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn(`[Proxy → Manufacturer] ${endpoint} timed out`);
      return res.status(202).json({ success: true, message: "Request sent but manufacturer took too long to respond.", timeout: true });
    }
    console.error(`[Proxy → Manufacturer] ${endpoint} error:`, err.message);
    return res.status(500).json({ error: "Failed to forward to manufacturer.", details: err.message });
  } finally {
    clearTimeout(tid);
  }
});

export default router;
