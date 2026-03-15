"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES } from "@/lib/modules";

const DEFAULT_HIDDEN: string[] = [];

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("Asia/Dubai");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>(DEFAULT_HIDDEN);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase.from("profiles").select("display_name, hidden_modules").eq("id", user.id).single();
      setDisplayName(data?.display_name ?? "");
      setTimezone(data?.timezone ?? "Asia/Dubai");
      setHiddenModules(data?.hidden_modules ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ display_name: displayName.trim(), hidden_modules: hiddenModules, timezone }).eq("id", user.id);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  function toggleModule(id: string) {
    setHiddenModules(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push("/login"); };

  if (loading) return <div style={{ padding:40, textAlign:"center" }}>Loading…</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl mb-1" style={{ color:"var(--text-primary)" }}>Settings</h1>
        <p className="text-sm" style={{ color:"var(--text-muted)" }}>Manage your account and app preferences</p>
      </div>

      {/* Profile */}
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor:"var(--card-border)" }}>
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color:"var(--text-muted)" }}>Profile</h2>
        </div>
        <div className="px-6 py-6 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color:"var(--text-secondary)" }}>Display name</label>
            <p className="text-xs mb-3" style={{ color:"var(--text-muted)" }}>How you'll be greeted on the Dashboard.</p>
            <div className="flex gap-3">
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} placeholder="Enter your name"
                className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition-colors"
                style={{ background:"var(--main-bg2)", border:"1px solid var(--card-border)", color:"var(--text-primary)" }} />
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-amber-500 transition-colors disabled:opacity-50">
                {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color:"var(--text-secondary)" }}>Email</label>
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background:"var(--main-bg2)", border:"1px solid var(--card-border)", color:"var(--text-muted)" }}>{email}</div>
          </div>
        </div>
      </div>

      {/* Dashboard modules visibility */}
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor:"var(--card-border)" }}>
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color:"var(--text-muted)" }}>Dashboard modules</h2>
          <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>Hide modules from the Dashboard overview. Hidden modules still work via the sidebar.</p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3">
          {MODULES.map(m => (
            <div key={m.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg">{m.icon}</span>
                <div>
                  <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>{m.label}</p>
                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>{m.description}</p>
                </div>
              </div>
              <button onClick={() => toggleModule(m.id)}
                className="relative w-11 h-6 rounded-full transition-colors duration-200"
                style={{ background: hiddenModules.includes(m.id) ? "var(--card-border)" : "#F5A623" }}>
                <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                  style={{ left: hiddenModules.includes(m.id) ? "2px" : "22px" }} />
              </button>
            </div>
          ))}
          <button onClick={handleSave} disabled={saving}
            className="mt-2 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-amber-500 transition-colors disabled:opacity-50 self-end">
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save visibility"}
          </button>
        </div>
      </div>

      {/* Timezone */}
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor:"var(--card-border)" }}>
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color:"var(--text-muted)" }}>Timezone</h2>
          <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>Affects how dates and times are displayed throughout the app.</p>
        </div>
        <div className="px-6 py-6">
          <select value={timezone} onChange={e => setTimezone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background:"var(--main-bg2)", border:"1px solid var(--card-border)", color:"var(--text-primary)" }}>
            {["Asia/Dubai","Asia/Kolkata","Asia/Riyadh","Europe/London","America/New_York","America/Los_Angeles","Asia/Singapore","Australia/Sydney","UTC"].map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>
            ))}
          </select>
          <button onClick={handleSave} disabled={saving}
            className="mt-3 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-amber-500 transition-colors disabled:opacity-50">
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save timezone"}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor:"var(--card-border)" }}>
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color:"var(--text-muted)" }}>About</h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          {[{ label:"App", value:"MyLife Dashboard" }, { label:"Version", value:"Phase 3" }, { label:"Database", value:"Supabase PostgreSQL" }].map(row => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-sm" style={{ color:"var(--text-muted)" }}>{row.label}</span>
              <span className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div className="rounded-2xl border overflow-hidden" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-5">
          <button onClick={handleSignOut} className="px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
            style={{ background:"rgba(244,63,94,0.1)", border:"1px solid rgba(244,63,94,0.3)", color:"#f43f5e" }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
