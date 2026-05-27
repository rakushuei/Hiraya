import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, Filter, Edit2, Trash2, ChevronLeft, ChevronRight, X, Sparkles, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { Button, Badge } from "../ui/Common";
import { cn, generateId, conversions } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { rtdb } from "../../lib/firebase";
import { ref, set, remove, update } from "firebase/database";

const FABRIC_TYPES = ["Cotton", "Polyester", "Linen", "Silk", "Denim", "Wool", "Rayon", "Spandex", "Canvas", "Satin"];
const COLORS = ["White", "Black", "Blue", "Yellow", "Red", "Pastel", "Khaki", "Navy", "Grey", "Green", "Brown"];
const TEXTURES = ["Smooth", "Rough", "Matte", "Glossy", "Stretchable", "Heavyweight", "Lightweight", "Breathable Mesh", "Heavy", "Soft"];

export const Inventory = ({ fabrics }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFabric, setEditingFabric] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Custom visual state controls
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState("success"); // success, error, info

  // Auto Dismiss Toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, selectedStatus]);

  // Read real fabrics from Firebase Realtime Database
  const allCombinations = useMemo(() => {
    if (!fabrics) return [];
    return fabrics.map(f => {
      const reorderLevel = f.reorderLevel || 15;
      const quantity = f.quantity !== undefined ? Number(f.quantity) : 0;
      const reserved = f.reserved !== undefined ? Number(f.reserved) : 0;
      
      let status = "Available";
      if (quantity === 0) status = "Critical";
      else if (quantity <= reorderLevel) status = "Low Stock";

      return {
        ...f,
        id: f.id,
        type: f.type || "Other",
        color: f.color || "N/A",
        texture: f.texture || "N/A",
        gsm: f.gsm || 180,
        width: f.width || 150,
        rollLength: f.rollLength || 100,
        quantity: quantity,
        reserved: reserved,
        unitPrice: f.unitPrice || 0,
        reorderLevel: reorderLevel,
        status: status,
        updatedAt: f.updatedAt || null,
        isVirtual: false
      };
    });
  }, [fabrics]);

  const filteredFabrics = allCombinations.filter(f => {
    const matchesSearch = f.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = selectedType === "All" || f.type === selectedType;
    const matchesStatus = selectedStatus === "All" || f.status === selectedStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalPages = Math.ceil(filteredFabrics.length / itemsPerPage) || 1;
  const paginatedFabrics = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFabrics.slice(start, start + itemsPerPage);
  }, [filteredFabrics, currentPage]);

  const handleDelete = (id) => {
    setDeleteTargetId(id);
    setIsConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await remove(ref(rtdb, `fabrics/${deleteTargetId}`));
      setToastType("success");
      setToastMessage("Fabric SKU deleted successfully from Firebase RTDB!");
    } catch (e) {
      console.error("Delete error:", e);
      setToastType("error");
      setToastMessage("Failed to delete Fabric SKU: " + e.message);
    } finally {
      setIsConfirmDeleteOpen(false);
      setDeleteTargetId(null);
    }
  };

  const handleStatus = (quantity, reorderLevel) => {
    if (quantity <= reorderLevel * 0.5) return "Critical";
    if (quantity <= reorderLevel) return "Low Stock";
    return "Available";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 font-heading tracking-tight">Raw Materials</h2>
          <p className="text-slate-500 text-sm">Manage and track your fabric warehouse SKUs</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button onClick={() => { setEditingFabric(null); setIsModalOpen(true); }} className="gap-2 shrink-0 geometric-button-shadow">
            <Plus className="w-4 h-4" /> Add New SKU
          </Button>
        </div>
      </div>

      <div className="geometric-card">
        <div className="px-6 py-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search inventory, categories..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Type:</label>
              <select 
                className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 outline-none pr-6 h-8"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="All">All Types</option>
                {FABRIC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Status:</label>
              <select 
                className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 outline-none pr-6 h-8"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="All">All Status</option>
                <option value="Available">Available</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            
            {(selectedType !== "All" || selectedStatus !== "All" || searchTerm !== "") && (
              <button 
                onClick={() => {
                  setSearchTerm("");
                  setSelectedType("All");
                  setSelectedStatus("All");
                }}
                className="text-[10px] font-black uppercase text-primary hover:text-primary/70 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Material ID</th>
                <th className="px-6 py-4">Fabric Type</th>
                <th className="px-6 py-4">Color & Texture</th>
                <th className="px-6 py-4 text-right">GSM / Width</th>
                <th className="px-6 py-4 text-right">Unit Price (₱)</th>
                <th className="px-6 py-4 text-right">Stock (Available/Reserved)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedFabrics.map((fabric) => (
                <tr key={fabric.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 font-mono text-xs text-primary font-bold">{fabric.id}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900">{fabric.type}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full border border-slate-200 shadow-inner", {
                        "bg-white": fabric.color === "White",
                        "bg-slate-900": fabric.color === "Black",
                        "bg-blue-600": fabric.color === "Blue",
                        "bg-yellow-400": fabric.color === "Yellow",
                        "bg-red-500": fabric.color === "Red",
                        "bg-pink-100": fabric.color === "Pastel",
                        "bg-orange-200": fabric.color === "Khaki",
                        "bg-navy-900": fabric.color === "Navy",
                      })} />
                      <span className="text-slate-600 font-medium">{fabric.color} • {fabric.texture}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 text-right">{fabric.gsm} GSM • {fabric.width}cm</td>
                  <td className="px-6 py-4 text-right font-black text-slate-900 text-sm">₱{fabric.unitPrice?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end">
                      <div className="text-sm font-black text-slate-900">
                        {(fabric.quantity - fabric.reserved)} <span className="text-[10px] text-slate-400 font-bold tracking-tight">AVAILABLE</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">
                        {fabric.reserved} Reserved / {fabric.quantity} Total
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium">
                        ~{conversions.rollsToMeters(fabric.quantity - fabric.reserved).toFixed(0)}m / {conversions.metersToYards(conversions.rollsToMeters(fabric.quantity - fabric.reserved)).toFixed(0)}yd
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={fabric.status === "Available" ? "success" : fabric.status === "Low Stock" ? "warning" : fabric.status === "Out of Stock" ? "secondary" : "error"}>
                      {fabric.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                         onClick={() => { setEditingFabric(fabric); setIsModalOpen(true); }}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-white rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                         onClick={() => handleDelete(fabric.id)}
                         className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50/20 animate-fade-in">
          <div>
            Showing {Math.min(filteredFabrics.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredFabrics.length, currentPage * itemsPerPage)} of {filteredFabrics.length} filtered results ({allCombinations.length} total SKUs)
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="px-2 h-8 rounded-lg"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-black tracking-normal lowercase normal-case">
              Page {currentPage} of {totalPages}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              className="px-2 h-8 rounded-lg"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={cn(
              "fixed top-6 right-6 z-[100] max-w-sm w-full p-4 rounded-xl shadow-xl border flex items-start gap-4 backdrop-blur-md",
              toastType === "success" && "bg-emerald-50/95 border-emerald-200 text-emerald-800",
              toastType === "error" && "bg-red-50/95 border-red-200 text-red-800",
              toastType === "info" && "bg-blue-50/95 border-blue-200 text-blue-800"
            )}
          >
            {toastType === "success" && <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />}
            {toastType === "error" && <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />}
            {toastType === "info" && <Info className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />}
            <div className="flex-1">
              <p className="text-xs font-bold leading-relaxed">{toastMessage}</p>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}



        {isConfirmDeleteOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm"
              onClick={() => setIsConfirmDeleteOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-100"
            >
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="p-2.5 bg-red-50 rounded-xl">
                  <Trash2 className="w-6 h-6 animate-bounce" />
                </div>
                <h3 className="text-lg font-black text-slate-900">Delete Material SKU</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Are you sure you want to delete SKU <strong>{deleteTargetId}</strong>? This action cannot be undone and will immediately remove the product from your inventory records.
              </p>
              <div className="flex items-center gap-3 justify-end">
                <Button variant="outline" size="sm" onClick={() => setIsConfirmDeleteOpen(false)}>Cancel</Button>
                <Button variant="default" size="sm" onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 border-red-600 text-white font-bold px-4 py-2">
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {isModalOpen && (
          <FabricModal 
            onClose={() => setIsModalOpen(false)} 
            onSave={async (f) => {
              try {
                if (editingFabric) {
                  // Edit mode — straight update, no duplicate check
                  await set(ref(rtdb, `fabrics/${editingFabric.id}`), {
                    ...f,
                    id: editingFabric.id,
                    reserved: editingFabric.reserved || 0,
                    status: handleStatus(f.quantity, f.reorderLevel),
                    updatedAt: new Date().toISOString()
                  });
                  setToastType("success");
                  setToastMessage("Fabric SKU updated successfully!");
                } else {
                  // Add mode — check if type+color+texture already exists
                  const existing = allCombinations.find(
                    fab =>
                      fab.type?.toLowerCase()    === f.type?.toLowerCase() &&
                      fab.color?.toLowerCase()   === f.color?.toLowerCase() &&
                      fab.texture?.toLowerCase() === f.texture?.toLowerCase()
                  );

                  if (existing) {
                    // Sum the quantities
                    const newQty = (existing.quantity || 0) + (f.quantity || 0);
                    await set(ref(rtdb, `fabrics/${existing.id}`), {
                      ...existing,
                      quantity: newQty,
                      // Keep other fields from the form (price, gsm, etc.) if changed
                      gsm:          f.gsm          || existing.gsm,
                      width:        f.width        || existing.width,
                      rollLength:   f.rollLength   || existing.rollLength,
                      unitPrice:    f.unitPrice    || existing.unitPrice,
                      reorderLevel: f.reorderLevel || existing.reorderLevel,
                      supplierOrigin: f.supplierOrigin || existing.supplierOrigin,
                      status: handleStatus(newQty, f.reorderLevel || existing.reorderLevel),
                      updatedAt: new Date().toISOString()
                    });
                    setToastType("info");
                    setToastMessage(`SKU already exists — added ${f.quantity} rolls to existing stock. New total: ${newQty} rolls.`);
                  } else {
                    // Truly new SKU
                    const newSku = generateId("", { fabric: f.type, color: f.color, texture: f.texture });
                    await set(ref(rtdb, `fabrics/${newSku}`), {
                      ...f,
                      id: newSku,
                      reserved: 0,
                      status: handleStatus(f.quantity, f.reorderLevel),
                      updatedAt: new Date().toISOString()
                    });
                    setToastType("success");
                    setToastMessage("New fabric SKU added successfully!");
                  }
                }
                setIsModalOpen(false);
              } catch (e) {
                console.error("Save error:", e);
                setToastType("error");
                setToastMessage("Save failed: " + e.message);
              }
            }}
            initialData={editingFabric}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Pill picker with custom Add ───────────────────────────────────────────────
function PillPicker({ label, options, value, onChange }) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom]  = useState("");

  const handleAdd = () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setCustom("");
    setAdding(false);
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all",
              value === opt
                ? "bg-slate-900 text-white border-slate-900 shadow"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"
            )}
          >
            {opt}
          </button>
        ))}

        {/* Add custom */}
        {adding ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type="text"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
              placeholder="Type & press Enter"
              className="px-3 py-1.5 rounded-full text-xs font-bold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-40"
            />
            <button type="button" onClick={handleAdd}
              className="px-3 py-1.5 rounded-full text-xs font-black bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 transition-all">
              Add
            </button>
            <button type="button" onClick={() => { setAdding(false); setCustom(""); }}
              className="px-2 py-1.5 rounded-full text-xs font-black text-slate-400 hover:text-slate-600 border border-slate-200 transition-all">
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>
      {/* Show selected value if it's a custom one not in the list */}
      {value && !options.includes(value) && (
        <p className="text-[10px] text-emerald-600 font-bold">
          Custom: <span className="font-black">{value}</span>
        </p>
      )}
    </div>
  );
}

const FabricModal = ({ onClose, onSave, initialData }) => {
  const isEdit = !!initialData;
  const [formData, setFormData] = useState(initialData || {
    type: "Cotton",
    color: "White",
    texture: "Smooth",
    gsm: 180,
    width: 150,
    rollLength: 100,
    quantity: 10,
    unitPrice: 350,
    reorderLevel: 5,
    supplierOrigin: "",
  });

  // Integer-only handler for Roll Qty
  const handleIntChange = (field, raw) => {
    const int = parseInt(raw, 10);
    setFormData(prev => ({ ...prev, [field]: isNaN(int) ? "" : int }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:p-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-navy-900 rounded-lg">
          <X className="w-6 h-6" />
        </button>
        <h3 className="text-2xl font-bold text-navy-900 font-heading mb-8">
          {isEdit ? "Edit Fabric SKU" : "Add New Fabric SKU"}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pill pickers — only shown when adding */}
          {!isEdit ? (
            <>
              <PillPicker
                label="Fabric Type"
                options={FABRIC_TYPES}
                value={formData.type}
                onChange={v => setFormData(p => ({ ...p, type: v }))}
              />
              <PillPicker
                label="Color"
                options={COLORS}
                value={formData.color}
                onChange={v => setFormData(p => ({ ...p, color: v }))}
              />
              <PillPicker
                label="Texture"
                options={TEXTURES}
                value={formData.texture}
                onChange={v => setFormData(p => ({ ...p, texture: v }))}
              />
            </>
          ) : (
            /* Edit mode — show locked type/color/texture as read-only */
            <>
              {[
                { label: "Fabric Type", value: formData.type },
                { label: "Color",       value: formData.color },
                { label: "Texture",     value: formData.texture },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
                  <div className="px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-500 cursor-not-allowed">
                    {value}
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Unit Price (₱)</label>
            <input
              type="number" min="0"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formData.unitPrice}
              onChange={e => setFormData({ ...formData, unitPrice: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">GSM (Weight)</label>
            <input
              type="number" min="0"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formData.gsm}
              onChange={e => setFormData({ ...formData, gsm: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Roll Qty {isEdit ? "" : "(will be added to existing if SKU matches)"}
            </label>
            <input
              type="number" min="0" step="1"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formData.quantity}
              onChange={e => handleIntChange("quantity", e.target.value)}
              onKeyDown={e => { if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Reorder Level</label>
            <input
              type="number" min="0" step="1"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formData.reorderLevel}
              onChange={e => handleIntChange("reorderLevel", e.target.value)}
              onKeyDown={e => { if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
            />
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={() => onSave(formData)} className="w-full flex-1">
            {isEdit ? "Save Changes" : "Create Material Entry"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};
