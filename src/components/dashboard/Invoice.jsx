import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, Printer, Download, CheckCircle2, Factory, User, Hash, Calendar, DollarSign, Package, Copy, Check, Database, Share2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/Common";
import { getX12InvoiceSegments } from "../../lib/ediUtils";

export const Invoice = ({ order }) => {
  const [pushedToDB, setPushedToDB] = useState(false);
  const invoiceNo = order.invoiceNumber || `INV-${order.poNumber?.replace('PO-', '') || order.id?.replace('MAT-', '')}`;
  const invoiceDate = order.updatedAt ? new Date(order.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const materialsSubtotal = (order.items || []).reduce((s, i) => s + (Number(i.quantity)||0) * (Number(i.unitPrice || i.price)||0), 0)
    || Number(order.totalAmount || 0);
  const freightCost   = Number(order.invoiceFreightCost || order.freightTotalAmount || 0);
  const grandTotal    = order.invoicedTotalAmount
    ? Number(order.invoicedTotalAmount)
    : materialsSubtotal + freightCost;

  const isPaid       = order.paymentStatus === "Paid";
  const statusLabel  = isPaid ? "PAID" : "PENDING";
  const statusClass  = isPaid
    ? "bg-emerald-50 text-emerald-600 border-emerald-100"
    : "bg-amber-50 text-amber-600 border-amber-100";

  return (
    <div className="bg-white text-slate-900 p-8 md:p-12 font-sans overflow-hidden relative">
      <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12 mt-12 md:mt-0">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-900 text-white rounded-2xl">
              <Factory className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight leading-none uppercase">Hiraya</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-1">Industrial Fulfillment</p>
            </div>
          </div>
          <div className="text-xs text-slate-500 space-y-1">
            <p>Manufacturing Hub Alpha, Santo Tomas</p>
            <p>Batangas, 4234, PH</p>
            <p>VAT ID: PH-987654321</p>
          </div>
        </div>

        <div className="text-right space-y-2">
          <div className="px-4 py-1 bg-blue-600 inline-block text-white text-[10px] font-black uppercase tracking-widest rounded-full mb-4">
            EDI 810 INVOICE
          </div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{invoiceNo}</h2>
          <div className="flex flex-col items-end gap-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billing Date</p>
            <p className="text-sm font-black">{invoiceDate}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12 py-8 border-t border-b border-slate-100">
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Bill To (Manufacturer)</h3>
          <div className="space-y-2">
            <p className="text-lg font-black text-slate-900">{order.customer || order.customerName}</p>
            <div className="text-sm text-slate-500 space-y-1">
              <p>{order.companyAddress}</p>
              <p>{order.companyCity}</p>
              <p>Reference PO: {order.poNumber || order.id}</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Payment Summary</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase">Status</span>
              <Badge variant="outline" className={cn("font-black", statusClass)}>{statusLabel}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase">Terms</span>
              <span className="text-sm font-black italic">Net 30</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-xs font-black text-slate-900 uppercase">Total Amount Due</span>
              <span className="text-lg font-black text-blue-600">₱{grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-12">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Price</th>
              <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(order.items || []).map((item, idx) => (
              <tr key={idx}>
                <td className="py-6">
                  <p className="text-sm font-black text-slate-900">{item.materialName || item.productName}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    {item.fabricType} • {item.color} • {item.texture}
                    {item.materialNo && ` | SKU: ${item.materialNo}`}
                  </p>
                </td>
                <td className="py-6 text-center">
                  <p className="text-sm font-black text-slate-900">{item.quantity} <span className="text-[10px] text-slate-400">{item.unit}</span></p>
                </td>
                <td className="py-6 text-right">
                  <p className="text-sm font-black text-slate-900">₱{(item.unitPrice || item.price || 0).toLocaleString()}</p>
                </td>
                <td className="py-6 text-right">
                  <p className="text-sm font-black text-slate-900">₱{((item.quantity || 0) * (item.unitPrice || item.price || 0)).toLocaleString()}</p>
                </td>
              </tr>
            ))}
            {/* Freight / Shipping fee line */}
            {freightCost > 0 && (
              <tr className="bg-slate-50/50">
                <td className="py-4">
                  <p className="text-sm font-black text-slate-700">Freight / Shipping Fee</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    CarGo Logistics · LTL Service
                  </p>
                </td>
                <td className="py-4 text-center">
                  <p className="text-sm font-black text-slate-700">1 <span className="text-[10px] text-slate-400">Service</span></p>
                </td>
                <td className="py-4 text-right">
                  <p className="text-sm font-black text-slate-700">₱{freightCost.toLocaleString()}</p>
                </td>
                <td className="py-4 text-right">
                  <p className="text-sm font-black text-slate-700">₱{freightCost.toLocaleString()}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row justify-between gap-12 pt-12 border-t border-slate-100">
        <div className="space-y-4 max-w-sm">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction Governance</h4>
          <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
            This invoice is generated automatically by Hiraya ERP system under EDI Protocol 810. 
            All materials identified by SHA-256 hashes for shipment tracking. 
            Payments must be settled via the Manufacturer Portal digital bridge.
          </p>
        </div>
        <div className="space-y-4 text-right">
          <div className="space-y-2">
            <div className="flex justify-between items-center gap-8 min-w-48">
              <span className="text-xs font-bold text-slate-400 uppercase">Subtotal</span>
              <span className="text-sm font-black text-slate-900">₱{(order.totalAmount || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center gap-8">
              <span className="text-xs font-bold text-slate-400 uppercase">VAT (12%)</span>
              <span className="text-sm font-black text-slate-900">₱0.00 <span className="text-[8px] text-slate-400">(Inclusive)</span></span>
            </div>
            <div className="flex justify-between items-center gap-8 pt-4 border-t border-slate-200">
              <span className="text-base font-black text-slate-900 uppercase">Balance Due</span>
              <span className="text-2xl font-black text-blue-600">₱{(order.totalAmount || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
