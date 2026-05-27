import React from "react";
import { cn } from "../../lib/utils";
import { Factory, ShieldCheck, Mail, MapPin } from "lucide-react";

export const PurchaseOrder = ({ order }) => {
  if (!order) return null;

  // Use values from the order object or fall back to defaults
  const company = {
    name: order.customer || "HIDI-EYE RETAIL CO.",
    address: order.companyAddress || "71 boulevard Malesherbes",
    city: order.companyCity || "75017, Paris",
  };

  const supplier = {
    name: "Hiraya Industries",
    address: "Manufacturing Hub Alpha, Santo Tomas",
    city: "Batangas, 4234, PH",
    email: "fulfillment@hiraya.io"
  };

  const deliveryAddress = {
    name: order.deliveryName || "Regional DC Paris",
    address: order.deliveryAddress || "21 rue de Hauteville",
    city: order.deliveryCity || "92100, Paris",
  };

  const creationDate = `${new Date(order.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const requestedDeliveryDate = order.requestedDate ? new Date(order.requestedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "January 11, 2026";
  const orderNumber = order.poNumber || "11424";

  // Simulation fallback for items if not present
  const items = order.items || [
    { id: 1, ean: "9012345123451", article: order.fabricType || "Product 1", unit: order.unit || "Yards", quantity: order.quantity || 1000 },
  ];

  return (
    <div className="bg-white text-slate-900 shadow-none font-sans overflow-hidden relative">
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 text-white rounded-2xl">
            <Factory className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight leading-none uppercase">Hiraya</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-1">Industrial Fulfillment</p>
          </div>
        </div>
        <div className="text-right">
          <div className="inline-block px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 mb-2">
            Verified PO Document
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tighter uppercase tabular-nums">#{orderNumber}</div>
        </div>
      </div>

      {/* Info Sections */}
      <div className="grid grid-cols-2 gap-12 mb-16">
        <div className="space-y-8">
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 flex items-center gap-2">
              <MapPin className="w-3 h-3" /> Supplier 
            </h3>
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{supplier.name}</p>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">{supplier.address}<br />{supplier.city}</p>
              <p className="text-xs text-blue-500 font-bold underline flex items-center gap-1.5 mt-2">
                <Mail className="w-3 h-3" /> {supplier.email}
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Delivery Destination</h3>
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{deliveryAddress.name}</p>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">{deliveryAddress.address}<br />{deliveryAddress.city}</p>
            </div>
          </section>
        </div>

        <div className="space-y-8 pt-0.5">
          <div className="grid grid-cols-2 gap-4">
            <section className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Issue Date</h3>
              <p className="text-sm font-bold text-slate-900">{creationDate}</p>
            </section>
            <section className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Desired Eta</h3>
              <p className="text-sm font-bold text-slate-900">{requestedDeliveryDate}</p>
            </section>
          </div>

          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Customer Entity</h3>
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{company.name}</p>
              <p className="text-sm text-slate-500 font-medium">{company.address}</p>
              <p className="text-sm text-slate-500 font-medium">{company.city}</p>
            </div>
          </section>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Material Resource</th>
              <th className="px-3 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Material No.</th>
              <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Qty</th>
              <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Rate</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Total (PHP)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                <td className="px-6 py-5">
                  <div className="font-bold text-slate-900 tracking-tight">{item.materialName || item.article || "Material Name"}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{item.unit || "Yards"} UNIT SPEC</div>
                </td>
                <td className="px-3 py-5 text-slate-600 font-mono text-[9px] break-all max-w-[120px]">{item.materialNo || item.ean || "9012345123451"}</td>
                <td className="px-4 py-5 text-slate-900 font-black text-right tracking-tighter">
                  {Number(item.quantity).toLocaleString()}
                </td>
                <td className="px-4 py-5 text-slate-500 font-bold text-right text-xs">
                  ₱{Number(item.unitPrice || 350).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-5 text-slate-900 font-black text-right tabular-nums">
                  ₱{(Number(item.quantity) * Number(item.unitPrice || 350)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-50/50">
              <td colSpan="2" className="px-6 py-8">
                <div className="flex items-center gap-2 text-emerald-600">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Transaction Authenticated by Hiraya Secure Ledger</span>
                </div>
              </td>
              <td className="px-4 py-8 text-right">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Items Summary</div>
                <div className="text-xl font-black text-slate-900 tabular-nums">{items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0).toLocaleString()}</div>
              </td>
              <td colSpan="2" className="px-6 py-8 text-right bg-emerald-50">
                <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1">Grand Total Payable</div>
                <div className="text-3xl font-black text-emerald-600 tabular-nums">
                  ₱{(items.length > 0 
                    ? items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice || 0)), 0)
                    : (order.totalAmount || 0)
                  ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-16 flex items-end justify-between">
        <div className="max-w-[300px]">
          <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-wider">
            This document is a legally binding requisition protocol generated between Supplier "Hiraya" and Manufacturer Plant specified above. Subject to standard supply chain terms and conditions.
          </p>
        </div>
        <div className="text-right">
          <div className="w-40 h-10 border-b border-slate-900 mb-2 ml-auto"></div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-900">Digital Signature Authorized</p>
          <p className="text-[8px] text-slate-400 font-mono mt-1">HASH: {Math.random().toString(36).substring(2, 15).toUpperCase()}</p>
        </div>
      </div>
    </div>
  );
};
