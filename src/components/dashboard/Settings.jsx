import React, { useState, useEffect } from "react";
import {
  Settings, Save, RefreshCw,
  Warehouse, Truck, CheckCircle2, User, Lock, Eye, EyeOff, AlertCircle
} from "lucide-react";
import { Button } from "../ui/Common";
import { cn } from "../../lib/utils";
import { rtdb, auth } from "../../lib/firebase";
import { ref, onValue, set } from "firebase/database";
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithPopup,
} from "firebase/auth";

const SETTINGS_PATH = "settings/edi";

const DEFAULT_CONFIG = {
  // Carrier
  carrierApiUrl:  "https://grip-faceplate-alienate.ngrok-free.dev/api/loadtenders",
  carrierId:      "CRGO",
  carrierName:    "CarGo",
  carrierScac:    "CRGO",
  serviceType:    "LTL",
  // Company
  isaId:          "Hiraya",
  shipperName:    "Hiraya",
  // Origin warehouse
  warehouseName:    "Main Warehouse",
  warehouseAddress: "148 Industrial Ave, Sector 4",
  warehouseCity:    "Manila",
  warehouseState:   "NCR",
  warehousePostal:  "1000",
  contactPerson:    "Drich",
  contactPhone:     "0917-123-4567",
};

// ── Account Section ───────────────────────────────────────────────────────────
function AccountSection() {
  const user = auth.currentUser;
  const isMock = !user || user.uid === "mock-admin";
  const isGoogle = user?.providerData?.some(p => p.providerId === "google.com");

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [currentPw, setCurrentPw]     = useState("");
  const [newPw, setNewPw]             = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [nameStatus, setNameStatus]   = useState(null); // null | "saving" | "saved" | "error"
  const [pwStatus, setPwStatus]       = useState(null);
  const [pwError, setPwError]         = useState("");

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setNameStatus("saving");
    try {
      if (!isMock) await updateProfile(user, { displayName: displayName.trim() });
      setNameStatus("saved");
      setTimeout(() => setNameStatus(null), 3000);
    } catch {
      setNameStatus("error");
    }
  };

  const handleChangePassword = async () => {
    setPwError("");
    if (!newPw) return setPwError("New password is required.");
    if (newPw.length < 6) return setPwError("Password must be at least 6 characters.");
    if (newPw !== confirmPw) return setPwError("Passwords do not match.");

    setPwStatus("saving");
    try {
      if (isMock) {
        // Demo mode — just simulate success
        await new Promise(r => setTimeout(r, 600));
      } else if (isGoogle) {
        // Google users re-auth via popup
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
        await updatePassword(user, newPw);
      } else {
        // Email/password users need current password
        if (!currentPw) { setPwStatus(null); return setPwError("Current password is required."); }
        const cred = EmailAuthProvider.credential(user.email, currentPw);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, newPw);
      }
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwStatus("saved");
      setTimeout(() => setPwStatus(null), 3000);
    } catch (e) {
      setPwStatus(null);
      setPwError(e.code === "auth/wrong-password" ? "Current password is incorrect." : e.message || "Failed to update password.");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-50 bg-slate-50/50">
        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
          <User className="w-4 h-4 text-emerald-400" />
        </div>
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Account</h3>
        {isMock && (
          <span className="ml-auto text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">
            Demo Mode
          </span>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Current account info */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center flex-shrink-0">
            {user?.photoURL
              ? <img src={user.photoURL} alt="" className="w-12 h-12 rounded-2xl object-cover" />
              : <User className="w-6 h-6 text-slate-400" />}
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">{user?.displayName || displayName || "Admin User"}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              {user?.email || "admin@hiraya.io"}
            </p>
            {isGoogle && (
              <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                Google Account
              </span>
            )}
          </div>
        </div>

        {/* Display name */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Display Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setNameStatus(null); }}
              placeholder="Your name"
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
            />
            <Button
              className={cn("h-10 px-4 text-xs gap-2 transition-all",
                nameStatus === "saved" ? "bg-emerald-600 hover:bg-emerald-600" : "")}
              onClick={handleSaveName}
              disabled={nameStatus === "saving" || !displayName.trim()}
            >
              {nameStatus === "saving"
                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : nameStatus === "saved"
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : <Save className="w-3.5 h-3.5" />}
              {nameStatus === "saved" ? "Saved!" : "Save"}
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-100" />
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-300" />
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Change Password</span>
          </div>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        {isGoogle ? (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <p className="text-xs text-blue-600 font-medium">
              You signed in with Google. Password changes are managed through your Google account.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Current password — not shown for mock/demo */}
            {!isMock && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPw}
                    onChange={e => { setCurrentPw(e.target.value); setPwError(""); }}
                    placeholder="Enter current password"
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                  />
                  <button type="button" onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* New password */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPw}
                  onChange={e => { setNewPw(e.target.value); setPwError(""); }}
                  placeholder="Min. 6 characters"
                  className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setPwError(""); }}
                placeholder="Repeat new password"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
              />
            </div>

            {/* Error */}
            {pwError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-600 font-medium">{pwError}</p>
              </div>
            )}

            <Button
              className={cn("w-full h-10 text-xs gap-2 transition-all",
                pwStatus === "saved" ? "bg-emerald-600 hover:bg-emerald-600" : "")}
              onClick={handleChangePassword}
              disabled={pwStatus === "saving"}
            >
              {pwStatus === "saving"
                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : pwStatus === "saved"
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : <Lock className="w-3.5 h-3.5" />}
              {pwStatus === "saved" ? "Password Updated!" : "Update Password"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-50 bg-slate-50/50">
        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, type = "text", hint, fullWidth, secret }) {
  const [show, setShow] = useState(false);

  return (
    <div className={cn("flex flex-col gap-1.5", fullWidth && "md:col-span-2")}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
        {label}
      </label>
      <div className="relative">
        <input
          type={secret && !show ? "password" : "text"}
          name={name}
          value={value}
          onChange={onChange}
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all pr-10"
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400 font-medium">{hint}</p>}
    </div>
  );
}

export const EDISettings = () => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load from Firebase
  useEffect(() => {
    const dbRef = ref(rtdb, SETTINGS_PATH);
    const unsub = onValue(dbRef, snap => {
      const val = snap.val();
      if (val) setConfig({ ...DEFAULT_CONFIG, ...val });
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await set(ref(rtdb, SETTINGS_PATH), { ...config, updatedAt: new Date().toISOString() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Settings save error:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 font-heading tracking-tight uppercase">
            EDI Configuration
          </h2>
          <p className="text-slate-500 text-sm font-medium tracking-tight">
            Carrier API, warehouse origin, and company identity settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 h-10 px-4 text-xs"
            onClick={handleReset}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </Button>
          <Button
            className={cn(
              "gap-2 h-10 px-5 text-xs transition-all",
              saved ? "bg-emerald-600 hover:bg-emerald-600" : ""
            )}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Account */}
      <AccountSection />

      {/* Carrier API */}
      <Section title="Carrier API — CarGo" icon={Truck}>
        <Field
          label="Logistics API URL"
          name="carrierApiUrl"
          value={config.carrierApiUrl}
          onChange={handleChange}
          fullWidth
          hint="CarGo load tender endpoint"
        />
        <Field
          label="Freight Invoice API URL"
          name="freightInvoiceApiUrl"
          value={config.freightInvoiceApiUrl || ""}
          onChange={handleChange}
          fullWidth
          hint="CarGo invoice endpoint — leave blank to auto-derive from Logistics API URL"
        />
        <Field label="Carrier ID"   name="carrierId"   value={config.carrierId}   onChange={handleChange} />
        <Field label="Carrier Name" name="carrierName" value={config.carrierName} onChange={handleChange} />
        <Field label="Carrier SCAC" name="carrierScac" value={config.carrierScac} onChange={handleChange} />
        <Field label="Service Type" name="serviceType" value={config.serviceType} onChange={handleChange} hint="LTL or FTL" />
      </Section>

      {/* Company Identity */}
      <Section title="Company Identity" icon={Settings}>
        <Field label="ISA ID (EDI Sender)"  name="isaId"      value={config.isaId}      onChange={handleChange} hint="Your EDI interchange ID" />
        <Field label="Shipper Name"         name="shipperName" value={config.shipperName} onChange={handleChange} />
      </Section>

      {/* Origin Warehouse */}
      <Section title="Origin Warehouse" icon={Warehouse}>
        <Field label="Warehouse Name"    name="warehouseName"    value={config.warehouseName}    onChange={handleChange} />
        <Field label="Street Address"    name="warehouseAddress" value={config.warehouseAddress} onChange={handleChange} />
        <Field label="City"              name="warehouseCity"    value={config.warehouseCity}    onChange={handleChange} />
        <Field label="State / Region"    name="warehouseState"   value={config.warehouseState}   onChange={handleChange} />
        <Field label="Postal Code"       name="warehousePostal"  value={config.warehousePostal}  onChange={handleChange} />
        <Field label="Contact Person"    name="contactPerson"    value={config.contactPerson}    onChange={handleChange} />
        <Field label="Contact Phone"     name="contactPhone"     value={config.contactPhone}     onChange={handleChange} />
      </Section>

      {saved && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <p className="text-sm font-black text-emerald-700">
            Settings saved to Firebase. The server will use these values on the next EDI 204 dispatch.
          </p>
        </div>
      )}
    </div>
  );
};
