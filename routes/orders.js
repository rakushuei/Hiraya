/**
 * routes/orders.js
 * ─────────────────────────────────────────────────────────────────────────────
 * EDI Order Pipeline — all CRUD + workflow advancement for purchase orders.
 *
 * Mounted at: /api/orders
 *
 * Endpoints:
 *   GET    /api/orders                  List all orders
 *   POST   /api/orders                  Create / submit a new order (EDI 850)
 *   GET    /api/orders/:id              Get a single order
 *   PUT    /api/orders/:id/status       Update status / workflow step
 *   PUT    /api/orders/:id/transit      Update EDI-214 transit sub-status
 *   PUT    /api/orders/:id/decline      Decline an order
 *   PUT    /api/orders/:id/note         Add a supplier note to an order
 *   DELETE /api/orders/:id              Delete an order
 */

import { Router } from "express";

const router = Router();

const RTDB_URL =
  "https://gen-lang-client-0250795173-default-rtdb.firebaseio.com/";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders
// List all orders, sorted newest first
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const response = await fetch(`${RTDB_URL}orders.json`);
    if (!response.ok) throw new Error(`RTDB error ${response.status}`);

    const data = await response.json();
    if (!data) return res.json([]);

    const list = Object.entries(data)
      .map(([id, val]) => ({ id, ...val }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return res.json(list);
  } catch (err) {
    console.error("[GET /orders]", err.message);
    return res.status(500).json({ error: "Failed to fetch orders.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders
// Submit a new Purchase Order (EDI 850)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const order = req.body;
    if (!order?.id) {
      return res.status(400).json({ error: "Field 'id' is required." });
    }

    order.updatedAt   = new Date().toISOString();
    order.workflowStep = order.workflowStep ?? 0;
    order.status      = order.status || "Supplier Confirmation (855)";

    const response = await fetch(`${RTDB_URL}orders/${order.id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    if (!response.ok) throw new Error(`RTDB error ${response.status}`);

    const saved = await response.json();
    return res.status(201).json({ success: true, message: "Order created.", order: saved });
  } catch (err) {
    console.error("[POST /orders]", err.message);
    return res.status(500).json({ error: "Failed to create order.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id
// Fetch a single order by ID
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${RTDB_URL}orders/${id}.json`);
    if (!response.ok) throw new Error(`RTDB error ${response.status}`);

    const data = await response.json();
    if (!data) return res.status(404).json({ error: "Order not found." });

    return res.json(data);
  } catch (err) {
    console.error("[GET /orders/:id]", err.message);
    return res.status(500).json({ error: "Failed to fetch order.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/status
// Advance or update the workflow step / status
// Body: { status, workflowStep, ...extra }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, workflowStep, declineReason, declined, ...rest } = req.body;

    const getRes = await fetch(`${RTDB_URL}orders/${id}.json`);
    const original = await getRes.json();
    if (!original) return res.status(404).json({ error: "Order not found." });

    const updated = {
      ...original,
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    if (status       !== undefined) updated.status       = status;
    if (workflowStep !== undefined) updated.workflowStep = workflowStep;
    if (declineReason !== undefined) updated.declineReason = declineReason;
    if (declined     !== undefined) updated.declined     = declined;

    const putRes = await fetch(`${RTDB_URL}orders/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!putRes.ok) throw new Error(`RTDB error ${putRes.status}`);

    const result = await putRes.json();
    return res.json({ success: true, message: "Order status updated.", order: result });
  } catch (err) {
    console.error("[PUT /orders/:id/status]", err.message);
    return res.status(500).json({ error: "Failed to update status.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/transit
// Update EDI-214 transit sub-status (Pending / Pickup / In Transit / Delivered)
// Body: { transitStatus: "In Transit" }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id/transit", async (req, res) => {
  try {
    const { id } = req.params;
    const { transitStatus } = req.body;

    const allowed = ["Pending", "Pickup", "In Transit", "Delivered"];
    if (!transitStatus || !allowed.includes(transitStatus)) {
      return res.status(400).json({
        error: `'transitStatus' must be one of: ${allowed.join(", ")}.`,
      });
    }

    const getRes = await fetch(`${RTDB_URL}orders/${id}.json`);
    const original = await getRes.json();
    if (!original) return res.status(404).json({ error: "Order not found." });

    const updated = {
      ...original,
      transitStatus,
      status: `Transit Status: ${transitStatus} (214)`,
      updatedAt: new Date().toISOString(),
    };

    const putRes = await fetch(`${RTDB_URL}orders/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!putRes.ok) throw new Error(`RTDB error ${putRes.status}`);

    const result = await putRes.json();
    return res.json({ success: true, message: `Transit status set to '${transitStatus}'.`, order: result });
  } catch (err) {
    console.error("[PUT /orders/:id/transit]", err.message);
    return res.status(500).json({ error: "Failed to update transit status.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/decline
// Decline an order with a reason
// Body: { declineReason: "Out of stock" }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id/decline", async (req, res) => {
  try {
    const { id } = req.params;
    const { declineReason } = req.body;

    if (!declineReason?.trim()) {
      return res.status(400).json({ error: "'declineReason' is required." });
    }

    const getRes = await fetch(`${RTDB_URL}orders/${id}.json`);
    const original = await getRes.json();
    if (!original) return res.status(404).json({ error: "Order not found." });

    const updated = {
      ...original,
      status: "Declined",
      declined: true,
      declineReason,
      updatedAt: new Date().toISOString(),
    };

    const putRes = await fetch(`${RTDB_URL}orders/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!putRes.ok) throw new Error(`RTDB error ${putRes.status}`);

    const result = await putRes.json();
    return res.json({ success: true, message: "Order declined.", order: result });
  } catch (err) {
    console.error("[PUT /orders/:id/decline]", err.message);
    return res.status(500).json({ error: "Failed to decline order.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/note
// Add or update a supplier note on an order
// Body: { supplierNote: "Only 80 rolls available this week." }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id/note", async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierNote } = req.body;

    if (!supplierNote?.trim()) {
      return res.status(400).json({ error: "'supplierNote' is required." });
    }

    const getRes = await fetch(`${RTDB_URL}orders/${id}.json`);
    const original = await getRes.json();
    if (!original) return res.status(404).json({ error: "Order not found." });

    const updated = {
      ...original,
      supplierNote,
      updatedAt: new Date().toISOString(),
    };

    const putRes = await fetch(`${RTDB_URL}orders/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!putRes.ok) throw new Error(`RTDB error ${putRes.status}`);

    const result = await putRes.json();
    return res.json({ success: true, message: "Supplier note saved.", order: result });
  } catch (err) {
    console.error("[PUT /orders/:id/note]", err.message);
    return res.status(500).json({ error: "Failed to save note.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/orders/:id
// Remove an order from the database
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const delRes = await fetch(`${RTDB_URL}orders/${id}.json`, { method: "DELETE" });
    if (!delRes.ok) throw new Error(`RTDB error ${delRes.status}`);

    return res.json({ success: true, message: `Order '${id}' deleted.` });
  } catch (err) {
    console.error("[DELETE /orders/:id]", err.message);
    return res.status(500).json({ error: "Failed to delete order.", details: err.message });
  }
});

export default router;
