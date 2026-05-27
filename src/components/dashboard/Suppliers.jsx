import React, { useState } from "react";
import { Plus, Search, Mail, Phone, Globe, Edit2, Trash2 } from "lucide-react";
import { Button, Badge } from "../ui/Common";

export const Suppliers = ({ suppliers }) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = suppliers.filter(s => 
    s.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-navy-900 font-heading">Supplier Network</h2>
        <Button className="gap-2"><Plus className="w-4 h-4" /> Add Supplier</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="geometric-card p-6 bg-white">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total Suppliers</p>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-extrabold font-heading text-slate-900">{suppliers.length}</h2>
            <Badge variant="outline">Global</Badge>
          </div>
        </div>
        <div className="geometric-card p-6 bg-white">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Active Mills</p>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-extrabold font-heading text-emerald-600">{suppliers.filter(s => s.role === 'Mill').length}</h2>
            <Badge variant="success">Verified</Badge>
          </div>
        </div>
        <div className="geometric-card p-6 bg-white">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Regions Covered</p>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-extrabold font-heading text-blue-600">{new Set(suppliers.map(s => s.country)).size}</h2>
            <Badge variant="primary" className="bg-blue-50 text-blue-600 border-blue-100">Intl</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="md:col-span-2 lg:col-span-3">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search companies, origin..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {filtered.map((s) => (
          <div key={s.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-primary font-bold text-xl uppercase tracking-tighter">
                {s.companyName.charAt(0)}
              </div>
              <Badge variant={s.status === "Active" ? "success" : "default"}>{s.status}</Badge>
            </div>
            
            <h3 className="text-lg font-bold text-navy-900 mb-1">{s.companyName}</h3>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-[10px] uppercase py-0 px-1.5 h-auto leading-tight">{s.role}</Badge>
              <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 uppercase tracking-wider">
                <Globe className="w-3 h-3" /> {s.country}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="text-sm font-semibold text-slate-700 flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">👤</div>
                {s.contactPerson}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Mail className="w-4 h-4 text-gray-400" /> {s.email}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" /> {s.phone}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {s.specialty.map((spec, i) => (
                <span key={i} className="text-[10px] font-bold bg-navy-50 text-navy-600 px-2 py-0.5 rounded uppercase tracking-widest">{spec}</span>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="flex-1 gap-2">
                <Edit2 className="w-4 h-4" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 px-3">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
