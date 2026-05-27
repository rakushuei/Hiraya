/**
 * routes/fabrics.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fabric / Raw Materials Inventory — full CRUD for warehouse SKUs.
 *
 * Mounted at: /api/fabrics
 *
 * Endpoints:
 *   GET    /api/fabrics                 List all fabric SKUs
 *   POST   /api/fabrics                 Create a new SKU
 *   GET    /api/fabrics/:id             Get a single SKU
 *   PUT    /api/fabrics/:id             Update a SKU (full replace)
 *   PATCH  /api/fabrics/:id/stock       Adjust stock quantity / reserved
 *   DELETE /api/fabrics/:id             Delete a SKU
 */

import { Router } from "express";

const router = Router();

const RTDB_URL =
  "https://gen-lang-client-0250795173-default-rtdb.firebaseio.com/";

// Helper — derive status from quantity vs reorder level
const deriveStatus = (quantity, reorderLevel = 15) => {
  if (quantity <= 0) return "Critical";
  if (quantity <= reorderLevel * 0.5) return "Critical";
  if (quantity <= reorderLevel) return "Low Stock";
  return "Available";
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fabrics
// List all fabric SKUs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const response = await fetch(`${RTDB_URL}fabrics.json`);
    if (!response.ok) throw new Error(`RTDB error ${response.status}`);

    const data = await response.json();
    if (!data) return res.json([]);

    const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    return res.json(list);
  } catch (err) {
    console.error("[GET /fabrics]", err.message);
    return res.status(500).json({ error: "Failed to fetch fabrics.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fabrics
// Create a new fabric SKU
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const fabric = req.body;

    if (!fabric?.id) {
      return res.status(400).json({ error: "Field 'id' (SKU) is required." });
    }

    const payload = {
      ...fabric,
      reserved: fabric.reserved ?? 0,
      status: deriveStatus(fabric.quantity ?? 0, fabric.reorderLevel ?? 15),
      updatedAt: new Date().toISOString(),
    };

    const response = await fetch(`${RTDB_URL}fabrics/${fabric.id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`RTDB error ${response.status}`);

    const saved = await response.json();
    return res.status(201).json({ success: true, message: "Fabric SKU created.", fabric: saved });
  } catch (err) {
    console.error("[POST /fabrics]", err.message);
    return res.status(500).json({ error: "Failed to create fabric.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fabrics/:id
// Get a single fabric SKU
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${RTDB_URL}fabrics/${id}.json`);
    if (!response.ok) throw new Error(`RTDB error ${response.status}`);

    const data = await response.json();
    if (!data) return res.status(404).json({ error: "Fabric SKU not found." });

    return res.json(data);
  } catch (err) {
    console.error("[GET /fabrics/:id]", err.message);
    return res.status(500).json({ error: "Failed to fetch fabric.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/fabrics/:id
// Full update / replace of a fabric SKU
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fabric = req.body;

    const getRes = await fetch(`${RTDB_URL}fabrics/${id}.json`);
    const original = await getRes.json();
    if (!original) return res.status(404).json({ error: "Fabric SKU not found." });

    const updated = {
      ...original,
      ...fabric,
      id, // keep the id stable
      status: deriveStatus(
        fabric.quantity ?? original.quantity ?? 0,
        fabric.reorderLevel ?? original.reorderLevel ?? 15
      ),
      updatedAt: new Date().toISOString(),
    };

    const putRes = await fetch(`${RTDB_URL}fabrics/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!putRes.ok) throw new Error(`RTDB error ${putRes.status}`);

    const result = await putRes.json();
    return res.json({ success: true, message: "Fabric SKU updated.", fabric: result });
  } catch (err) {
    console.error("[PUT /fabrics/:id]", err.message);
    return res.status(500).json({ error: "Failed to update fabric.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/fabrics/:id/stock
// Adjust stock — reserve, deduct, or release rolls
// Body: { action: "reserve"|"deduct"|"release"|"set", rolls: 5 }
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/stock", async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rolls, quantity, reserved } = req.body;

    const getRes = await fetch(`${RTDB_URL}fabrics/${id}.json`);
    const original = await getRes.json();
    if (!original) return res.status(404).json({ error: "Fabric SKU not found." });

    let newQuantity = Number(original.quantity) || 0;
    let newReserved = Number(original.reserved) || 0;

    if (action === "reserve") {
      newReserved = newReserved + Number(rolls);
    } else if (action === "deduct") {
      newQuantity = Math.max(0, newQuantity - Number(rolls));
      newReserved = Math.max(0, newReserved - Number(rolls));
    } else if (action === "release") {
      newReserved = Math.max(0, newReserved - Number(rolls));
    } else if (action === "set") {
      // Direct set — useful for manual corrections
      if (quantity !== undefined) newQuantity = Number(quantity);
      if (reserved !== undefined) newReserved = Number(reserved);
    } else {
      return res.status(400).json({
        error: "Invalid 'action'. Use: reserve, deduct, release, or set.",
      });
    }

    const updated = {
      ...original,
      quantity: newQuantity,
      reserved: newReserved,
      status: deriveStatus(newQuantity, original.reorderLevel ?? 15),
      updatedAt: new Date().toISOString(),
    };

    const putRes = await fetch(`${RTDB_URL}fabrics/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!putRes.ok) throw new Error(`RTDB error ${putRes.status}`);

    const result = await putRes.json();
    return res.json({
      success: true,
      message: `Stock '${action}' applied. New qty: ${newQuantity}, reserved: ${newReserved}.`,
      fabric: result,
    });
  } catch (err) {
    console.error("[PATCH /fabrics/:id/stock]", err.message);
    return res.status(500).json({ error: "Failed to adjust stock.", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/fabrics/:id
// Delete a fabric SKU
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const delRes = await fetch(`${RTDB_URL}fabrics/${id}.json`, { method: "DELETE" });
    if (!delRes.ok) throw new Error(`RTDB error ${delRes.status}`);

    return res.json({ success: true, message: `Fabric SKU '${id}' deleted.` });
  } catch (err) {
    console.error("[DELETE /fabrics/:id]", err.message);
    return res.status(500).json({ error: "Failed to delete fabric.", details: err.message });
  }
});

export default router;
