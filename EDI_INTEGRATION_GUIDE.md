# Hiraya B2B EDI REST API Integration Guide

This guide is designed for your classmate (the **Manufacturer**) to connect their separate system/inventory application with your **Hiraya** Supplier Portal. 

By using this option, the Manufacturer can keep their own independent database for their items or logs, but transfer and sync Purchase Orders (EDI 850) and Invoice states (EDI 810) seamlessly with your application via your standard REST API.

---

## 1. Base URL
Your current live API Base URL is:
```text
https://ais-pre-4zjfmjru7xztdxeyxr4t3x-339518471300.asia-southeast1.run.app
```
*(Note: When running on your local machine during development, use `http://localhost:3000`)*

---

## 2. API Endpoints for Integration

### 📋 1. Submit a New Purchase Order (EDI 850)
The manufacturer sends this when they place an order on their system. This automatically places it into your Hiraya fulfillment dashboard.

* **Method:** `POST`
* **Path:** `/api/edi/orders`
* **Headers:** `Content-Type: application/json`
* **JSON Request Body:**
```json
{
  "id": "PO-94827", 
  "poNumber": "PO-94827",
  "customer": "Vogue Apparel Co.",
  "customerId": "CUST-01",
  "orderDate": "2026-05-20T00:00:00Z",
  "requestedDate": "2026-06-05",
  "deliveryName": "Cavite Warehouse Plant 3",
  "deliveryAddress": "FCIE Compound, Governors Drive",
  "deliveryCity": "Dasmarinas, Cavite",
  "items": [
    {
      "materialNo": "FAB-CO-TW-4820",
      "materialName": "100% Organic Cotton Twill (Olive)",
      "quantity": 120,
      "unit": "Yards",
      "unitPrice": 4.50
    }
  ],
  "status": "Supplier Confirmation (855)",
  "workflowStep": 0
}
```

* **Javascript Fetch Example for the Manufacturer:**
```javascript
const orderPayload = {
  id: "PO-10294", // Must be unique
  poNumber: "PO-10294",
  customer: "Manufacturer Brand Name",
  orderDate: new Date().toISOString(),
  requestedDate: "2026-06-10",
  deliveryName: "Main Warehouse",
  deliveryAddress: "123 Manufacturing St.",
  deliveryCity: "Manila",
  items: [
    {
      "materialNo": "TXT-BLK-01",
      "materialName": "Premium Black Denim",
      "quantity": 250,
      "unit": "Yards",
      "unitPrice": 5.25
    }
  ]
};

fetch("https://ais-pre-4zjfmjru7xztdxeyxr4t3x-339518471300.asia-southeast1.run.app/api/edi/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(orderPayload)
})
.then(res => res.json())
.then(data => console.log("Success transmitting PO to Supplier:", data))
.catch(err => console.error("Error sending PO:", err));
```

---

### 🔄 2. Check Order Status
The manufacturer's app can call this to see if the status changed. For example, if you already updated the flow step to **FOR SHIPMENT & BILLED (856/810)** or accepted the order.

* **Method:** `GET`
* **Path:** `/api/edi/orders/:id` (Replace `:id` with the actual Purchase Order ID, e.g., `/api/edi/orders/PO-94827`)
* **Response Body Example:**
```json
{
  "id": "PO-94827",
  "poNumber": "PO-94827",
  "customer": "Vogue Apparel Co.",
  "status": "FOR SHIPMENT & BILLED (856/810)",
  "workflowStep": 1,
  "invoiceNumber": "INV-94827",
  "updatedAt": "2026-05-20T01:14:00Z"
}
```

---

### 🚛 3. Complete Flow Updates / Status Backporting
If either the manufacturer or you want to update the EDI state programmatically (like changing progress, declining, or adding tracking IDs).

* **Method:** `PUT`
* **Path:** `/api/edi/orders/:id/status` (Replace `:id` with the actual Purchase Order ID)
* **Headers:** `Content-Type: application/json`
* **JSON Request Body (Variable parameters):**
```json
{
  "status": "FOR SHIPMENT & BILLED (856/810)",
  "workflowStep": 1
}
```

---

## 3. Recommended Integration Sequence (How to design it)

1. **Step 1 (On Manufacturer Side):**
   * Their application places a fabric order in their database.
   * Immediately after saving it in their database, their app triggers a `POST` request to `/api/edi/orders` on your Supplier Portal.
2. **Step 2 (On your Supplier Side):**
   * Your dashboard detects the incoming order, pulls it, and shows it under the "Purchasing Orders" list.
   * You click "Acknowledge" (EDI 855) or transition it to "FOR SHIPMENT & BILLED (856/810)". This updates the state in the Firebase Realtime Database.
3. **Step 3 (Refreshed state check on Manufacturer Side):**
   * The manufacturer's dashboard can periodically poll `GET /api/edi/orders/:id` or fetch all your transactions via `GET /api/edi/orders` to reflect the current fulfillment status (Acknowledged, Shipped, Billed, Loaded) right inside their separate system!
