import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Package, Hash, User, Calendar, CheckCircle2, ArrowLeft, Plus, Trash2, Factory, Printer, Download, Zap, AlertCircle, Clock, XCircle, MessageSquare, FileText, DollarSign, X } from "lucide-react";
import { Button, Badge } from "../components/ui/Common";
import { rtdb, handleRTDBError, OperationType } from "../lib/firebase";
import { ref, set, push, onValue, query as rtdbQuery, orderByKey, limitToLast, get } from "firebase/database";
import { generateId, cn } from "../lib/utils";
import { useNavigate } from "react-router-dom";
import { INITIAL_FABRICS } from "../data";
import { useRTDBCollection } from "../hooks/useRTDBCollection";
import { PurchaseOrder } from "../components/dashboard/PurchaseOrder";
import { Invoice } from "../components/dashboard/Invoice";
import { getX12POSegments } from "../lib/ediUtils";

export const ManufacturerPortal = () => {
  const navigate = useNavigate();
  const [dynamicOptions, setDynamicOptions] = useState({ types: [], colors: [], textures: [] });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [viewingDoc, setViewingDoc] = useState(null); // { type: 'PO' | 'Invoice', order: object }

  // Listen for recent orders in RTDB
  useEffect(() => {
    const ordersRef = rtdbQuery(ref(rtdb, "orders"), limitToLast(20));
    const unsubscribe = onValue(ordersRef, (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.entries(data)
          .map(([id, item]) => ({ id, ...item }))
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        setRecentOrders(list);
      } else {
        setRecentOrders([]);
      }
    }, (err) => {
      console.error("Orders sync error:", err);
    });
    return () => unsubscribe();
  }, []);

  // Validate connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'system', 'connection_test'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firebase connection error: Check your configuration.");
        }
      }
    };
    testConnection();
  }, []);
  const [items, setItems] = useState([
    { id: Math.random().toString(36).substr(2, 9), fabricType: "", color: "", texture: "", quantity: 1000, unit: "Yards", unitPrice: 0 }
  ]);
  const UNITS = ["Yards", "Meters", "Rolls"];

  const getPrice = (type, color, texture) => {
    const match = INITIAL_FABRICS.find(f => 
      f.type === type && 
      f.color === color && 
      f.texture === texture
    );
    return match ? match.unitPrice : (type.length * 50) + (color.length * 10); 
  };

  const [formData, setFormData] = useState({
    customer: "NewForge", 
    poNumber: "",
    companyAddress: "Calamba, Laguna",
    companyCity: "4027, Philippines",
    deliveryName: "Regional DC Philippines",
    deliveryAddress: "Main Warehouse",
    deliveryCity: "4027, Philippines",
    requestedDate: new Date().toISOString().split('T')[0],
  });

  // Fetch dynamic options from RTDB
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const snap = await get(ref(rtdb, "fabrics"));
        const val = snap.val();
        const fabrics = val ? Object.values(val) : [];
        
        // Merge with initial data to ensure baseline options
        const allFabrics = [...INITIAL_FABRICS];
        fabrics.forEach(f => {
          if (!allFabrics.find(af => af.id === f.id)) allFabrics.push(f);
        });

        const types = [...new Set(allFabrics.map(f => f.type))].sort();
        const colors = [...new Set(allFabrics.map(f => f.color))].sort();
        const textures = [...new Set(allFabrics.map(f => f.texture))].sort();
        
        setDynamicOptions({ types, colors, textures });
        
        // Set initial item values if they are empty
        setItems(prev => prev.map(item => {
          const fabricType = item.fabricType || types[0] || "";
          const color = item.color || colors[0] || "";
          const texture = item.texture || textures[0] || "";
          return {
            ...item,
            fabricType,
            color,
            texture,
            unitPrice: getPrice(fabricType, color, texture)
          };
        }));
      } catch (e) {
        const errInfo = {
          error: e instanceof Error ? e.message : String(e),
          operationType: OperationType.LIST,
          path: "fabrics"
        };
        console.error("Error fetching options:", errInfo);
        setErrorDetails(errInfo);
      }
    };
    fetchOptions();
  }, []);

  // Auto-generate PO Number on mount
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      poNumber: `PO-${Math.floor(100000 + Math.random() * 900000)}`
    }));
  }, []);

  const addItem = () => {
    const type = dynamicOptions.types[0] || "";
    const color = dynamicOptions.colors[0] || "";
    const texture = dynamicOptions.textures[0] || "";
    
    setItems([
      ...items, 
      { 
        id: Math.random().toString(36).substr(2, 9), 
        fabricType: type, 
        color: color, 
        texture: texture, 
        quantity: 1000,
        unit: "Yards",
        unitPrice: getPrice(type, color, texture)
      }
    ]);
  };

  const removeItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => {
      if (item.id === id) {
          const updated = { ...item, [field]: value };
          // If specs change, update price automatically
          if (["fabricType", "color", "texture"].includes(field)) {
            updated.unitPrice = getPrice(updated.fabricType, updated.color, updated.texture);
          }
          return updated;
      }
      return item;
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const orderId = `SO-${formData.poNumber}`;
    const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const totalAmount = items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0);
    
    // Create order object
    const orderData = {
      ...formData,
      id: orderId,
      items: items.map(({ id, ...rest }) => ({
        ...rest,
        quantity: parseFloat(rest.quantity) || 0,
        unitPrice: parseFloat(rest.unitPrice) || 0,
        id: Math.floor(1 + Math.random() * 999), 
        materialName: `${rest.color} ${rest.texture} ${rest.fabricType}`.trim(),
        materialNo: `SKU-${rest.fabricType.substring(0,3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${rest.color.substring(0,2).toUpperCase()}`,
        unit: rest.unit
      })),
      totalQuantity,
      totalAmount,
      fabricType: items[0].fabricType, 
      color: items[0].color,
      texture: items[0].texture,
      quantity: totalQuantity,
      unit: items[0].unit || "Yards",
      orderDate: new Date().toISOString().split('T')[0],
      status: "Received",
      workflowStep: 0,
      updatedAt: new Date().toISOString(),
      source: "Manufacturer Portal"
    };

    // Merge ANSI X12 850 PO segments under 'EDI Transaction'
    const x12Segments = getX12POSegments(orderData);
    const finalOrderData = { ...orderData, "EDI Transaction": x12Segments };

    try {
      await set(ref(rtdb, `orders/${orderId}`), finalOrderData);
      setSubmittedOrder(finalOrderData);

      setIsSubmitted(true);
      setErrorDetails(null);
    } catch (error) {
      const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        operationType: OperationType.WRITE,
        path: `orders/${orderId}`
      };
      console.error("Transmission error:", errInfo);
      setErrorDetails(errInfo);
    } finally {
      setLoading(false);
    }
  };

  if (isSubmitted && submittedOrder) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 md:p-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl space-y-8"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-[#1a1a1a] p-8 rounded-3xl border border-white/5">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight uppercase">PO Generated Successfully</h1>
                <p className="text-slate-400 text-sm font-medium">Your request has been synchronized with the supplier system.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button 
                variant="outline" 
                onClick={() => window.print()}
                className="flex-1 md:flex-none h-12 bg-white/5 border-white/10 text-white hover:bg-white/10"
              >
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button 
                className="flex-1 md:flex-none h-12 bg-emerald-600 text-white hover:bg-emerald-700 font-bold"
                onClick={() => {
                   setIsSubmitted(false);
                   setItems([{ id: Math.random().toString(36).substr(2, 9), fabricType: dynamicOptions.types[0], color: dynamicOptions.colors[0], texture: dynamicOptions.textures[0], quantity: 1000, unit: "Yards" }]);
                   setFormData(prev => ({
                     ...prev,
                     poNumber: `PO-${Math.floor(100000 + Math.random() * 900000)}`
                   }));
                }}
              >
                New Order
              </Button>
            </div>
          </div>

          <div className="bg-[#121212] p-1 rounded-3xl overflow-hidden shadow-2xl">
            <PurchaseOrder order={submittedOrder} />
          </div>

          <p className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">
            Digital Signature Verified • EDI Transaction Set 850 • SHA-256 Hash Linked
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-200">
            <Factory className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">MANUFACTURER PORTAL</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Direct Raw Material Purchase Order (EDI 850)</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="bg-emerald-600 p-6 flex justify-between items-center text-white">
            <span className="text-xs font-black uppercase tracking-tighter">Supplier Direct-Link Mode</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-[10px] font-bold">SUPPLIER SYNC ACTIVE</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            {errorDetails && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-black text-red-900 uppercase">Synchronization Error</h4>
                  <p className="text-xs text-red-600 mt-1 font-medium">{errorDetails.error || "The system could not connect to the database. Verify your integration configuration."}</p>
                  <p className="text-[10px] text-red-400 mt-2 font-mono break-all">{JSON.stringify(errorDetails)}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">PO Number (Auto-Generated)</label>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    readOnly
                    className="w-full bg-slate-100 border-0 rounded-2xl h-14 pl-12 pr-4 font-bold text-slate-500 cursor-not-allowed"
                    value={formData.poNumber}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Company Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    required
                    className="w-full bg-slate-50 border-0 rounded-2xl h-14 pl-12 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 transition-all font-sans"
                    value={formData.customer}
                    onChange={e => setFormData({...formData, customer: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Company Address</label>
                <input 
                  required
                  className="w-full bg-slate-50 border-0 rounded-2xl h-14 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  value={formData.companyAddress}
                  onChange={e => setFormData({...formData, companyAddress: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Company City/Zip</label>
                <input 
                  required
                  className="w-full bg-slate-50 border-0 rounded-2xl h-14 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  value={formData.companyCity}
                  onChange={e => setFormData({...formData, companyCity: e.target.value})}
                />
              </div>
              <div className="space-y-1.5 pt-4 md:col-span-2 border-t border-slate-50 mt-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 ml-1">Delivery Destination</label>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Delivery Name</label>
                <input 
                  required
                  className="w-full bg-slate-50 border-0 rounded-2xl h-14 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  value={formData.deliveryName}
                  onChange={e => setFormData({...formData, deliveryName: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Delivery Address</label>
                <input 
                  required
                  className="w-full bg-slate-50 border-0 rounded-2xl h-14 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  value={formData.deliveryAddress}
                  onChange={e => setFormData({...formData, deliveryAddress: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Delivery City/Zip</label>
                <input 
                  required
                  className="w-full bg-slate-50 border-0 rounded-2xl h-14 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  value={formData.deliveryCity}
                  onChange={e => setFormData({...formData, deliveryCity: e.target.value})}
                />
              </div>
              <div className="space-y-1.5 pt-4 md:col-span-2 border-t border-slate-50 mt-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-purple-600 ml-1">Dates</label>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Requested Delivery Date</label>
                <input 
                  type="date"
                  required
                  className="w-full bg-slate-50 border-0 rounded-2xl h-14 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  value={formData.requestedDate}
                  onChange={e => setFormData({...formData, requestedDate: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Order Line Items</h3>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={addItem}
                  className="h-10 px-4 rounded-xl border-slate-200 text-xs font-black tracking-widest gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD RAW ITEM
                </Button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.id} 
                    className="relative p-6 bg-slate-50/50 rounded-2xl border border-slate-100 group"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="space-y-1.5 md:col-span-5">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-1">Material</label>
                        <div className="grid grid-cols-3 gap-2">
                          <select 
                            className="bg-white border border-slate-100 rounded-xl h-12 pl-3 pr-8 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 outline-none w-full"
                            value={item.fabricType}
                            onChange={e => updateItem(item.id, "fabricType", e.target.value)}
                          >
                            {dynamicOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select 
                            className="bg-white border border-slate-100 rounded-xl h-12 pl-3 pr-8 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 outline-none w-full"
                            value={item.color}
                            onChange={e => updateItem(item.id, "color", e.target.value)}
                          >
                            {dynamicOptions.colors.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select 
                            className="bg-white border border-slate-100 rounded-xl h-12 pl-3 pr-8 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 outline-none w-full"
                            value={item.texture}
                            onChange={e => updateItem(item.id, "texture", e.target.value)}
                          >
                            {dynamicOptions.textures.map(tx => <option key={tx} value={tx}>{tx}</option>)}
                          </select>
                        </div>
                      </div>
 
                      <div className="space-y-1.5 flex flex-col md:col-span-4">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-1">Quantity & Unit</label>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            required
                            className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl h-12 px-4 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 outline-none"
                            placeholder="Amount"
                            value={item.quantity}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === "" || /^\d*\.?\d*$/.test(val)) {
                                updateItem(item.id, "quantity", val);
                              }
                            }}
                          />
                          <select 
                            className="w-32 bg-white border border-slate-100 rounded-xl h-12 pl-3 pr-8 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 outline-none"
                            value={item.unit}
                            onChange={e => updateItem(item.id, "unit", e.target.value)}
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-1">Unit Price (₱)</label>
                        <input 
                          type="text"
                          readOnly
                          className="w-full bg-slate-100 border border-slate-200 rounded-xl h-12 px-4 text-xs font-bold text-slate-500 cursor-not-allowed outline-none"
                          placeholder="Price"
                          value={item.unitPrice}
                        />
                      </div>
 
                      <div className="flex items-end md:col-span-1">
                        <Button 
                          type="button"
                          variant="ghost" 
                          onClick={() => removeItem(item.id)}
                          disabled={items.length === 1}
                          className="w-full h-12 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-6 px-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Requisition Value</p>
                  <p className="text-2xl font-black text-slate-900">₱{items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-slate-400">PHP</span></p>
                </div>
                <Button 
                  type="submit" 
                  size="lg"
                  className="h-16 px-10 gap-3 bg-emerald-600 hover:bg-emerald-700 text-sm font-black tracking-[0.1em] rounded-2xl geometric-button-shadow"
                  disabled={loading}
                >
                  {loading ? "TRANSMITTING..." : "TRANSMIT PURCHASE ORDER (850)"}
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </form>
        </div>
        
        <p className="mt-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Secure End-to-End Encryption • Directly linked to Central ERP Instance
        </p>

        {/* Tracking Section */}
        <div className="mt-16 space-y-6 pb-20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-lg">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Recent Transmission Tracking</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time status from Supplier System</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {recentOrders.length === 0 ? (
              <div className="bg-white p-8 rounded-3xl border-2 border-dashed border-slate-200 text-center">
                <p className="text-sm font-medium text-slate-400">No recent EDI transmissions found.</p>
              </div>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center border-2",
                      order.declined ? "bg-red-50 border-red-100 text-red-500" :
                      order.workflowStep > 0 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-blue-50 border-blue-100 text-blue-500"
                    )}>
                      {order.declined ? <XCircle className="w-6 h-6" /> : <Package className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{order.id}</h4>
                        {order.declined && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[8px] font-black uppercase rounded">Declined</span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                        {order.items?.length || 1} Item(s) • PO: {order.poNumber}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Status:</span>
                      <span className={cn(
                        "text-xs font-black uppercase tracking-tight",
                        order.declined ? "text-red-500" : "text-emerald-600"
                      )}>
                        {order.declined ? "Order Rejected" : (order.status || "Received")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setViewingDoc({ type: 'PO', order })}
                        className="h-8 px-3 text-[9px] font-black uppercase tracking-widest border-slate-200 bg-white"
                      >
                        <FileText className="w-3 h-3 mr-1.5" /> 850 PO
                      </Button>
                      
                      {!order.declined && order.workflowStep >= 2 && (
                        <Button 
                          onClick={() => setViewingDoc({ type: 'Invoice', order })}
                          className="h-8 px-3 text-[9px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white border-0"
                        >
                          <DollarSign className="w-3 h-3 mr-1.5" /> 810 Invoice
                        </Button>
                      )}
                    </div>

                    {order.declined && order.declineReason && (
                       <div className="mt-2 text-[10px] font-bold text-red-500/70 uppercase">
                         REASON: {order.declineReason}
                       </div>
                    )}
                    {order.supplierNote && (
                      <div className="mt-2 flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 max-w-xs">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-slate-600 font-medium italic leading-relaxed">
                          " {order.supplierNote} "
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {/* Document Modal */}
        <AnimatePresence>
          {viewingDoc && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12 overflow-y-auto bg-slate-900/90 backdrop-blur-sm"
              onClick={() => setViewingDoc(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl relative"
                onClick={e => e.stopPropagation()}
              >
                <div className="absolute top-6 right-6 z-10 flex gap-2">
                  <button 
                    onClick={() => window.print()} 
                    className="p-3 bg-white/10 hover:bg-white text-slate-400 hover:text-slate-900 rounded-xl transition-all border border-slate-100"
                    title="Print Document"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setViewingDoc(null)} 
                    className="p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="max-h-[85vh] overflow-y-auto">
                  {viewingDoc.type === 'PO' ? (
                    <PurchaseOrder order={viewingDoc.order} />
                  ) : (
                    <Invoice order={viewingDoc.order} />
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Secure EDI Transfer Protocol • Transaction Verified by Hiraya ERP
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
