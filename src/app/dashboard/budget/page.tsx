"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { nowDubai, todayDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type Currency = "AED" | "INR" | "USD";
type Status = "pending" | "paid" | "skipped";

type DueItem = {
  id: string; name: string; group: string; dueDay: number | null;
  statementDay: number | null; defaultCurrency: Currency;
  defaultAmount: number | null; isFixed: boolean; isHidden: boolean; sortOrder: number;
  isRemittance?: boolean;
};

type DueEntry = {
  id: string; dueItemId: string; month: string; amount: number | null;
  currency: Currency; status: Status; paidAt: string | null; note: string;
};

type MonthSettings = {
  month: string; mainCurrency: Currency; note: string;
  cashIn: Record<string, number>; fxRates: Record<string, number>;
  groups: string[];
};

function nowMonth() { return nowDubai().slice(0, 7); }
function fmtMonth(m: string) { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo)-1, 1).toLocaleDateString("en-AE", { month:"long", year:"numeric" }); }
function prevMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function nextMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function fmtDateTime(iso: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleString("en-AE",{day:"2-digit",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"}); }
function ordinal(n: number) { const s=["th","st","nd","rd"]; const v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

function toAed(amount: number, currency: Currency, rates: Record<string, number>): number {
  if (currency === "AED") return amount;
  const rate = rates[currency];
  return rate ? amount / rate : amount;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(r: any): DueItem {
  return { id:r.id, name:r.name, group:r.group_name??"General", dueDay:r.due_date_day??r.due_day??null, statementDay:r.statement_date??null, defaultCurrency:(r.default_currency??"AED") as Currency, defaultAmount:r.default_amount??null, isFixed:r.is_fixed??false, isHidden:r.is_hidden??false, sortOrder:r.sort_order??0, isRemittance:r.is_remittance??false };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEntry(r: any): DueEntry {
  return { id:r.id, dueItemId:r.due_item_id, month:r.month, amount:r.amount??null, currency:(r.currency??"AED") as Currency, status:(r.status??"pending") as Status, paidAt:r.paid_at??null, note:r.note??"" };
}

const DEFAULT_GROUPS = ["UAE", "India"];
const DEFAULT_RATES: Record<string, number> = { INR: 25.2, USD: 3.67 };

export default function DueTrackerPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(nowMonth());
  const [items, setItems] = useState<DueItem[]>([]);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [settings, setSettings] = useState<MonthSettings>({ month, mainCurrency:"AED", note:"", cashIn:{}, fxRates:DEFAULT_RATES, groups:DEFAULT_GROUPS });
  const [showAddItem, setShowAddItem] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [editItemId, setEditItemId] = useState<string|null>(null);
  // Per-month remittance data: { "2026-03": { inr: "60000", rate: "25.4", paid: false } }
  const [remittanceData, setRemittanceData] = useState<Record<string,{inr:string;rate:string;paid:boolean}>>({});
  const [remittanceEditMonth, setRemittanceEditMonth] = useState(false);

  // Helpers for current month's remittance
  const remittanceInr  = remittanceData[month]?.inr  ?? "";
  const remittanceRate = remittanceData[month]?.rate  ?? "";
  const remittancePaid : Record<string,boolean> = Object.fromEntries(Object.entries(remittanceData).map(([m,v])=>[m,v.paid]));
  function setRemittanceInr(v:string)  { setRemittanceData(p=>({...p,[month]:{...p[month]??{inr:"",rate:"",paid:false},inr:v}})); }
  function setRemittanceRate(v:string) { setRemittanceData(p=>({...p,[month]:{...p[month]??{inr:"",rate:"",paid:false},rate:v}})); }
  function setRemittancePaid(fn:(p:Record<string,boolean>)=>Record<string,boolean>) {
    const cur = Object.fromEntries(Object.entries(remittanceData).map(([m,v])=>[m,v.paid]));
    const next = fn(cur);
    setRemittanceData(p=>{
      const n = {...p};
      Object.entries(next).forEach(([m,paid])=>{ n[m]={...n[m]??{inr:"",rate:"",paid:false},paid}; });
      return n;
    });
  }
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try { const s = localStorage.getItem("due_collapsed"); return s ? new Set(JSON.parse(s)) : new Set<string>(); } catch { return new Set<string>(); }
  });
  const [toast, setToast] = useState("");
  const [newItem, setNewItem] = useState({ name:"", group:"UAE", statementDay:"", dueDay:"", defaultCurrency:"AED" as Currency, defaultAmount:"", isFixed:false });

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      await loadAll(user.id, month);
      setLoading(false);
    }
    load();
  }, []);

  async function loadAll(uid: string, m: string) {
    const [itemsRes, entriesRes, settingsRes] = await Promise.all([
      supabase.from("due_items").select("*").eq("user_id", uid).order("sort_order").order("created_at"),
      supabase.from("due_entries").select("*").eq("user_id", uid).eq("month", m),
      supabase.from("due_month_settings").select("*").eq("user_id", uid).eq("month", m).maybeSingle(),
    ]);
    setItems((itemsRes.data ?? []).map(dbToItem));
    setEntries((entriesRes.data ?? []).map(dbToEntry));
    const s = settingsRes.data;
    setSettings(s
      ? { month:m, mainCurrency:s.main_currency??"AED", note:s.note??"", cashIn:s.cash_in??{}, fxRates:s.fx_rates??DEFAULT_RATES, groups:s.groups??DEFAULT_GROUPS }
      : { month:m, mainCurrency:"AED", note:"", cashIn:{}, fxRates:DEFAULT_RATES, groups:DEFAULT_GROUPS }
    );
    // Load saved remittance values for this month from settings
    if (s?.remittance_inr || s?.remittance_rate) {
      setRemittanceData(prev => ({...prev, [m]: {
        inr: s?.remittance_inr?.toString() ?? "",
        rate: s?.remittance_rate?.toString() ?? "",
        paid: s?.remittance_paid ?? false,
      }}));
    }
    markSynced();
  }

  async function changeMonth(m: string) {
    setMonth(m);
    if (userId) await loadAll(userId, m);
  }

  function getEntry(itemId: string) { return entries.find(e => e.dueItemId === itemId); }

  async function ensureEntry(item: DueItem): Promise<DueEntry> {
    const existing = getEntry(item.id);
    if (existing) return existing;
    if (!userId) throw new Error("no user");
    let amount = item.defaultAmount;
    if (item.isFixed) {
      const { data } = await supabase.from("due_entries").select("*").eq("due_item_id", item.id).eq("month", prevMonth(month)).maybeSingle();
      if (data?.amount != null) amount = data.amount;
    }
    const { data } = await supabase.from("due_entries").insert({ user_id:userId, due_item_id:item.id, month, amount, currency:item.defaultCurrency, status:"pending", note:"" }).select("*").single();
    if (data) { const entry = dbToEntry(data); setEntries(p => [...p, entry]); return entry; }
    throw new Error("failed");
  }

  async function togglePaid(item: DueItem) {
    const entry = await ensureEntry(item);
    const newStatus: Status = entry.status === "paid" ? "pending" : "paid";
    const paidAt = newStatus === "paid" ? new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Dubai"})).toISOString() : null;
    await supabase.from("due_entries").update({ status:newStatus, paid_at:paidAt }).eq("id", entry.id);
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, status:newStatus, paidAt } : e));
    showToast(newStatus === "paid" ? "✓ Marked as paid" : "Unmarked");
    if (userId) {
      if (newStatus === "paid") {
        await supabase.from("calendar_events").insert({ user_id:userId, date:new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Dubai"}), title:`Due paid: ${item.name}`, event_type:"due_paid", source_module:"due_tracker", source_id:entry.id, color:"#16a34a" });
      } else {
        await supabase.from("calendar_events").delete().eq("user_id", userId).eq("source_id", entry.id).eq("event_type", "due_paid");
      }
    }
  }

  async function updateEntryField(item: DueItem, field: string, value: unknown) {
    const entry = await ensureEntry(item);
    await supabase.from("due_entries").update({ [field]: value }).eq("id", entry.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, [field]: value } as any : e));
  }

  async function saveSettings() {
    if (!userId) return;
    await supabase.from("due_month_settings").upsert({
      user_id:userId, month, main_currency:settings.mainCurrency, note:settings.note,
      cash_in:settings.cashIn, fx_rates:settings.fxRates, groups:settings.groups
    }, { onConflict:"user_id,month" });
    showToast("Settings saved"); setShowSettings(false);
  }

  async function saveRemittanceForMonth() {
    if (!userId) return;
    const inr = parseFloat(remittanceInr) || 0;
    const rate = parseFloat(remittanceRate) || (settings.fxRates["INR"] ?? 25.2);
    const paid = remittanceData[month]?.paid ?? false;
    await supabase.from("due_month_settings").upsert({
      user_id:userId, month,
      remittance_inr: inr, remittance_rate: rate, remittance_paid: paid,
      fx_rates: { ...settings.fxRates }
    }, { onConflict:"user_id,month" });
    setRemittanceEditMonth(false);
    showToast("Remittance saved");
  }

  async function addDueItem() {
    if (!userId || !newItem.name.trim()) return;
    const { data } = await supabase.from("due_items").insert({ user_id:userId, name:newItem.name.trim(), group_name:newItem.group, statement_date:newItem.statementDay?parseInt(newItem.statementDay):null, due_date_day:newItem.dueDay?parseInt(newItem.dueDay):null, default_currency:newItem.defaultCurrency, default_amount:newItem.defaultAmount?parseFloat(newItem.defaultAmount):null, is_fixed:newItem.isFixed }).select("*").single();
    if (data) { setItems(p => [...p, dbToItem(data)]); setNewItem({ name:"", group:"UAE", statementDay:"", dueDay:"", defaultCurrency:"AED", defaultAmount:"", isFixed:false }); setShowAddItem(false); showToast("Added"); }
  }

  async function toggleHide(item: DueItem) {
    await supabase.from("due_items").update({ is_hidden:!item.isHidden }).eq("id", item.id);
    setItems(p => p.map(x => x.id === item.id ? { ...x, isHidden:!x.isHidden } : x));
    showToast(item.isHidden ? "Item shown" : "Item hidden (still counted in totals)");
  }

  function toggleGroup(g: string) {
    setCollapsedGroups(prev => {
      const n = new Set(prev); n.has(g)?n.delete(g):n.add(g);
      try { localStorage.setItem("due_collapsed", JSON.stringify([...n])); } catch {}
      return n;
    });
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2800); }

  // ── Stats ── ALL items count (including hidden)
  const stats = useMemo(() => {
    const fxRates = settings.fxRates;
    const indiaGroup = "India";
    const indiaIds = new Set(items.filter(x => x.group === indiaGroup).map(x => x.id));

    let totalAed = 0, paidAed = 0, paidCount = 0, pendingCount = 0;
    let indiaTotalInr = 0;

    for (const item of items) { // ALL items, hidden or not
      const isIndia = indiaIds.has(item.id);
      const entry = getEntry(item.id);
      const amount = entry?.amount ?? item.defaultAmount ?? 0;
      const currency = (entry?.currency ?? item.defaultCurrency) as Currency;

      if (isIndia) {
        const inr = currency === "INR" ? amount : toAed(amount, currency, fxRates) * (fxRates["INR"] ?? 25.2);
        indiaTotalInr += inr;
        // India items don't add to global — remittance represents them
      } else {
        const aed = toAed(amount, currency, fxRates);
        totalAed += aed;
      }

      if (entry?.status === "paid" || amount === 0) paidCount++;
      else pendingCount++;
      if ((entry?.status === "paid") && !isIndia) paidAed += toAed(amount, currency, fxRates);
    }

    // Remittance is manually entered; use remittanceInr + remittanceRate if set
    const effectiveRate = parseFloat(remittanceRate) || (fxRates["INR"] ?? 25.2);
    const effectiveInr  = parseFloat(remittanceInr)  || indiaTotalInr;
    const remittanceAed = effectiveInr / effectiveRate;
    // Add remittance to global total
    totalAed += remittanceAed;
    if (remittancePaid[month]) paidAed += remittanceAed;
    else pendingCount++;  // remittance counts as one pending item if unpaid
    paidCount += remittancePaid[month] ? 1 : 0;

    return { totalAed, paidAed, pendingAed: totalAed - paidAed, paidCount, pendingCount, indiaTotalInr, remittanceAed };
  }, [items, entries, settings, remittanceInr, remittanceRate, remittancePaid, month]);

  // Groups — show all items but render hidden ones dimmed
  const groups = useMemo(() => {
    const display = showHidden ? items : items.filter(x => !x.isHidden);
    const map = new Map<string, DueItem[]>();
    for (const item of display) {
      const g = item.group || "General";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return map;
  }, [items, showHidden]);

  // India total using ALL items (hidden or not)
  const indiaTotalInr = useMemo(() => {
    const fxRates = settings.fxRates;
    return items.filter(x => x.group === "India").reduce((s, item) => {
      const entry = getEntry(item.id);
      const amount = entry?.amount ?? item.defaultAmount ?? 0;
      const currency = (entry?.currency ?? item.defaultCurrency) as Currency;
      return s + (currency === "INR" ? amount : toAed(amount, currency, fxRates) * (fxRates["INR"] ?? 25.2));
    }, 0);
  }, [items, entries, settings]);

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623" };
  const btn = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;

  if (loading) return <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background:V.bg }}><div style={{ width:28, height:28, border:`2.5px solid ${V.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Due <span style={{ color:V.accent, fontStyle:"italic" }}>Tracker</span></div>
          <div style={{ fontSize:13, color:V.faint, marginTop:2 }}>Track your monthly payments</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button style={btn} onClick={() => setShowHidden(v=>!v)}>{showHidden?"Hide hidden":"Show hidden"}</button>
          <button style={btn} onClick={() => setShowSettings(true)}>⚙ Settings</button>
          <button style={btnP} onClick={() => setShowAddItem(true)}>+ Add due</button>
        </div>
      </div>

      {/* Month nav */}
      <div style={{ padding:"14px 24px 0", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <button style={btn} onClick={() => changeMonth(prevMonth(month))}>‹</button>
        <span style={{ fontSize:18, fontWeight:700, minWidth:180, textAlign:"center" }}>{fmtMonth(month)}</span>
        <button style={btn} onClick={() => changeMonth(nextMonth(month))}>›</button>
        <button style={{ ...btn, fontSize:12, padding:"6px 12px" }} onClick={() => changeMonth(nowMonth())}>Today</button>
      </div>

      {/* Stats */}
      <div style={{ padding:"12px 24px 0", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:10 }}>
        {[
          { label:"Total due (AED)", value:`AED ${stats.totalAed.toFixed(0)}`, color:V.accent },
          { label:"Paid",            value:`AED ${stats.paidAed.toFixed(0)}`,  color:"#16a34a" },
          { label:"Pending",         value:`AED ${stats.pendingAed.toFixed(0)}`, color:"#ef4444" },
          { label:"Items paid",      value:`${stats.paidCount}/${stats.paidCount+stats.pendingCount}`, color:V.muted },
        ].map(s => (
          <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:17, fontWeight:800, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {settings.note && <div style={{ margin:"10px 24px 0", padding:"9px 14px", background:"rgba(245,166,35,0.08)", border:"1px solid rgba(245,166,35,0.2)", borderRadius:10, fontSize:13 }}>📝 {settings.note}</div>}

      {/* Due items */}
      <div style={{ padding:"14px 24px 24px", display:"flex", flexDirection:"column", gap:14 }}>
        {Array.from(groups.entries()).map(([group, groupItems]) => {
          const isIndia = group === "India";
          const fxRates = settings.fxRates;
          const isCollapsed = collapsedGroups.has(group);

          // Group totals use ALL items in that group (even hidden ones)
          const allGroupItems = items.filter(x => x.group === group);
          let groupTotal = 0, groupPaid = 0;
          for (const item of allGroupItems) {
            const entry = getEntry(item.id);
            const amount = entry?.amount ?? item.defaultAmount ?? 0;
            const cur = (entry?.currency ?? item.defaultCurrency) as Currency;
            if (isIndia) {
              const inr = cur === "INR" ? amount : toAed(amount, cur, fxRates) * (fxRates["INR"] ?? 25.2);
              groupTotal += inr;
              if (entry?.status === "paid" || amount === 0) groupPaid += inr;
            } else {
              const aed = toAed(amount, cur, fxRates);
              groupTotal += aed;
              if (entry?.status === "paid" || amount === 0) groupPaid += aed;
            }
          }
          const currLabel = isIndia ? "INR" : "AED";

          return (
            <div key={group} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
              {/* Group header */}
              <div onClick={() => toggleGroup(group)} style={{ padding:"11px 16px", borderBottom:isCollapsed?undefined:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)", cursor:"pointer", userSelect:"none" }}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <span style={{ fontSize:12, color:V.faint, transition:"transform 0.2s", display:"inline-block", transform:isCollapsed?"rotate(-90deg)":"rotate(0deg)" }}>▾</span>
                  <span style={{ fontSize:14, fontWeight:800 }}>{group}</span>
                  <span style={{ fontSize:11, color:V.faint }}>{allGroupItems.length}</span>
                </div>
                <div style={{ display:"flex", gap:14, fontSize:12, color:V.muted }} onClick={e=>e.stopPropagation()}>
                  <span>Total: <strong style={{ color:V.text }}>{currLabel} {groupTotal.toFixed(0)}</strong></span>
                  <span style={{ color:"#16a34a" }}>Paid: <strong>{currLabel} {groupPaid.toFixed(0)}</strong></span>
                  <span style={{ color:"#ef4444" }}>Due: <strong>{currLabel} {(groupTotal-groupPaid).toFixed(0)}</strong></span>
                </div>
              </div>

              {/* Remittance row — manual entry, part of UAE group total */}
              {!isCollapsed && !isIndia && group === "UAE" && (() => {
                const isPaid = remittancePaid[month] ?? false;
                const inrVal = parseFloat(remittanceInr) || 0;
                const rateVal = parseFloat(remittanceRate) || (fxRates["INR"] ?? 25.2);
                const aedVal = inrVal > 0 ? inrVal / rateVal : 0;
                return (
                  <div style={{ padding:"10px 16px", borderBottom:`1px solid ${V.border}`, background:isDark?"rgba(245,166,35,0.04)":"rgba(245,166,35,0.02)" }}>
                    <div style={{ display:"flex", gap:10, alignItems:"flex-start", flexWrap:"wrap" }}>
                      <button onClick={async () => {
                        const newPaid = !isPaid;
                        setRemittanceData(p=>({...p,[month]:{...p[month]??{inr:"",rate:"",paid:false},paid:newPaid}}));
                        if (userId) await supabase.from("due_month_settings").upsert({user_id:userId,month,remittance_paid:newPaid},{onConflict:"user_id,month"});
                        showToast(newPaid?"✓ Remittance paid":"Unmarked");
                      }}
                        style={{ width:22, height:22, borderRadius:6, border:`2px solid ${isPaid?"#16a34a":V.border}`, background:isPaid?"#16a34a":"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                        {isPaid && <span style={{ color:"#fff", fontSize:12, fontWeight:800 }}>✓</span>}
                      </button>
                      <div style={{ flex:1, minWidth:120 }}>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <button onClick={() => router.push("/dashboard/budget/remittance")}
                            style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:14, fontWeight:700, color:isPaid?V.faint:V.text, textDecoration:isPaid?"line-through":"none" }}>
                            Remittance
                          </button>
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"rgba(245,166,35,0.12)", color:V.accent }}>Manual</span>
                        </div>
                        {remittanceEditMonth && (
                          <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap", alignItems:"center" }}>
                            <input type="number" style={{ ...inp, width:110, padding:"4px 8px", fontSize:12 }} value={remittanceInr} onChange={e=>setRemittanceInr(e.target.value)} placeholder="INR amount" />
                            <span style={{ fontSize:11, color:V.faint }}>÷</span>
                            <input type="number" step="0.01" style={{ ...inp, width:70, padding:"4px 8px", fontSize:12 }} value={remittanceRate} onChange={e=>setRemittanceRate(e.target.value)} placeholder="Rate" />
                            <span style={{ fontSize:11, color:V.faint }}>= AED {aedVal > 0 ? aedVal.toFixed(0) : "?"}</span>
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize:14, fontWeight:700, color:aedVal > 0 ? V.accent : V.faint }}>
                        {aedVal > 0 ? `AED ${aedVal.toFixed(0)}` : <span style={{ fontSize:12 }}>Enter amount →</span>}
                        {inrVal > 0 && <span style={{ fontSize:11, color:V.faint, marginLeft:6 }}>({inrVal.toFixed(0)} INR ÷ {rateVal})</span>}
                      </span>
                      <div style={{ display:"flex", gap:5 }}>
                        <button onClick={() => router.push("/dashboard/budget/remittance")} style={{ ...btn, padding:"4px 9px", fontSize:11, color:V.accent }}>History</button>
                        <button onClick={() => remittanceEditMonth ? saveRemittanceForMonth() : setRemittanceEditMonth(true)} style={{ ...btn, padding:"4px 9px", fontSize:11, color:remittanceEditMonth?V.accent:V.muted }}>{remittanceEditMonth?"Save":"Edit"}</button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Items */}
              {!isCollapsed && groupItems.map(item => {
                const entry = getEntry(item.id);
                const isPaid = entry?.status === "paid";
                const isEditing = editItemId === item.id;
                const displayAmt = entry?.amount ?? item.defaultAmount ?? 0;
                const displayCur = (entry?.currency ?? item.defaultCurrency) as Currency;

                // Statement/Due notation
                let dateNotation = "";
                if (item.statementDay && item.dueDay) dateNotation = `Statement: ${ordinal(item.statementDay)}  Due: ${ordinal(item.dueDay)}`;
                else if (item.statementDay) dateNotation = `Statement: ${ordinal(item.statementDay)}`;
                else if (item.dueDay) dateNotation = `Due: ${ordinal(item.dueDay)}`;

                return (
                  <div key={item.id} style={{ padding:"11px 16px", borderBottom:`1px solid ${V.border}`, opacity:item.isHidden?0.45:1 }}>
                    <div style={{ display:"flex", gap:10, alignItems:"flex-start", flexWrap:"wrap" }}>
                      {/* Checkbox */}
                      <button onClick={() => togglePaid(item)} style={{ width:22, height:22, borderRadius:6, border:`2px solid ${isPaid?"#16a34a":V.border}`, background:isPaid?"#16a34a":"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                        {isPaid && <span style={{ color:"#fff", fontSize:12, fontWeight:800 }}>✓</span>}
                      </button>

                      {/* Name + dates */}
                      <div style={{ flex:1, minWidth:120 }}>
                        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                          <span style={{ fontSize:14, fontWeight:700, textDecoration:isPaid?"line-through":"none", color:isPaid?V.faint:V.text }}>{item.name}</span>
                          {item.isFixed && <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"rgba(99,102,241,0.1)", color:"#6366f1" }}>Fixed</span>}
                          {item.isHidden && <span style={{ fontSize:10, color:V.faint }}>(hidden)</span>}
                        </div>
                        {dateNotation && <div style={{ fontSize:11, color:V.muted, marginTop:3 }}>
                          {item.statementDay && <span style={{ marginRight:8, fontWeight:600, color:"#F5A623" }}>S:{item.statementDay}</span>}
                          {item.dueDay && <span style={{ fontWeight:600, color:"#ef4444" }}>D:{item.dueDay}</span>}
                        </div>}
                        {/* Edit fields */}
                        {isEditing && (
                          <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                            <input defaultValue={entry?.note??""} placeholder="Note for this month…" onBlur={e=>updateEntryField(item,"note",e.target.value)} style={{ ...inp, fontSize:12, boxSizing:"border-box" as const }} />
                          </div>
                        )}
                        {!isEditing && entry?.note && <div style={{ fontSize:11, color:V.muted, fontStyle:"italic", marginTop:3 }}>{entry.note}</div>}
                        {isPaid && entry?.paidAt && <div style={{ fontSize:11, color:"#16a34a", marginTop:3 }}>Paid: {fmtDateTime(entry.paidAt)}</div>}
                      </div>

                      {/* Amount */}
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        {isEditing ? (
                          <>
                            <input type="number" defaultValue={displayAmt||""} placeholder="Amount" onBlur={e=>updateEntryField(item,"amount",e.target.value?parseFloat(e.target.value):null)} style={{ ...inp, width:100, textAlign:"right" }} />
                            <select defaultValue={displayCur} onChange={e=>updateEntryField(item,"currency",e.target.value)} style={{ ...inp, width:70 }}>
                              <option>AED</option><option>INR</option><option>USD</option>
                            </select>
                          </>
                        ) : (
                          <span style={{ fontSize:14, fontWeight:700, color:displayAmt===0?"#16a34a":V.text }}>
                            {displayAmt===0 ? <span style={{ color:"#16a34a" }}>✓ 0</span> : <>{displayCur} {displayAmt.toLocaleString()}</>}
                            {displayCur !== "AED" && displayAmt > 0 && <span style={{ fontSize:11, color:V.faint, marginLeft:6 }}>≈ AED {toAed(displayAmt, displayCur, settings.fxRates).toFixed(0)}</span>}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display:"flex", gap:5 }}>
                        <button onClick={() => router.push(`/dashboard/budget/${item.id}`)} style={{ ...btn, padding:"4px 9px", fontSize:11, color:V.accent }}>Stats</button>
                        <button onClick={() => setEditItemId(isEditing?null:item.id)} style={{ ...btn, padding:"4px 9px", fontSize:11, color:isEditing?V.accent:V.muted }}>{isEditing?"Done":"Edit"}</button>
                        <button onClick={() => toggleHide(item)} style={{ ...btn, padding:"4px 9px", fontSize:11, color:V.faint }}>{item.isHidden?"Show":"Hide"}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Add item modal */}
      {showAddItem && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowAddItem(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(520px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add due item</div>
              <button style={btn} onClick={()=>setShowAddItem(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", gridColumn:"1/-1" }}>
                Name <input style={{ ...inp, width:"100%", boxSizing:"border-box" as const }} value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="e.g. Rent" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Group
                <select style={inp} value={newItem.group} onChange={e=>setNewItem(p=>({...p,group:e.target.value}))}>
                  {settings.groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Currency <select style={inp} value={newItem.defaultCurrency} onChange={e=>setNewItem(p=>({...p,defaultCurrency:e.target.value as Currency}))}>
                  <option>AED</option><option>INR</option><option>USD</option>
                </select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Statement day <input style={inp} type="number" min="1" max="31" value={newItem.statementDay} onChange={e=>setNewItem(p=>({...p,statementDay:e.target.value}))} placeholder="e.g. 22" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Due day <input style={inp} type="number" min="1" max="31" value={newItem.dueDay} onChange={e=>setNewItem(p=>({...p,dueDay:e.target.value}))} placeholder="e.g. 10" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Default amount <input style={inp} type="number" value={newItem.defaultAmount} onChange={e=>setNewItem(p=>({...p,defaultAmount:e.target.value}))} placeholder="Optional" />
              </label>
              <label style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, fontWeight:600, color:V.text, cursor:"pointer" }}>
                <input type="checkbox" checked={newItem.isFixed} onChange={e=>setNewItem(p=>({...p,isFixed:e.target.checked}))} />
                Fixed (repeats each month)
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowAddItem(false)}>Cancel</button>
              <button style={btnP} onClick={addDueItem}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowSettings(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(560px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:11, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.1em" }}>{fmtMonth(month)}</div><div style={{ fontSize:18, fontWeight:800 }}>Month settings</div></div>
              <button style={btn} onClick={()=>setShowSettings(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Exchange rates (1 AED = ? local currency)</div>
                {(["INR","USD"] as const).map(cur => (
                  <div key={cur} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:600, width:40 }}>{cur}:</span>
                    <span style={{ fontSize:13, color:V.faint }}>1 AED =</span>
                    <input type="number" style={{ ...inp, width:90 }} value={settings.fxRates[cur]??""} onChange={e=>setSettings(p=>({...p,fxRates:{...p.fxRates,[cur]:parseFloat(e.target.value)||0}}))} />
                    <span style={{ fontSize:13, color:V.faint }}>{cur}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Groups</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                  {settings.groups.map(g => <span key={g} style={{ padding:"4px 12px", borderRadius:999, background:isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)", fontSize:12, fontWeight:600 }}>{g}</span>)}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <input style={{ ...inp, flex:1 }} placeholder="Add new group…" id="new-group-input" />
                  <button style={btnP} onClick={() => {
                    const input = document.getElementById("new-group-input") as HTMLInputElement;
                    const v = input.value.trim();
                    if (v && !settings.groups.includes(v)) { setSettings(p=>({...p,groups:[...p.groups,v]})); input.value=""; }
                  }}>Add</button>
                </div>
              </div>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Month note
                <textarea style={{ ...inp, resize:"vertical", minHeight:70 }} value={settings.note} onChange={e=>setSettings(p=>({...p,note:e.target.value}))} placeholder="Any notes for this month…" />
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowSettings(false)}>Cancel</button>
              <button style={btnP} onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}
