"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type Currency = "AED" | "INR" | "USD";
type Status = "pending" | "paid" | "skipped";

type DueItem = {
  id: string;
  name: string;
  group: string;
  dueDay: number | null;
  defaultCurrency: Currency;
  defaultAmount: number | null;
  isFixed: boolean;
  isHidden: boolean;
  sortOrder: number;
};

type DueEntry = {
  id: string;
  dueItemId: string;
  month: string;
  amount: number | null;
  currency: Currency;
  status: Status;
  paidAt: string | null;
  note: string;
};

type MonthSettings = {
  month: string;
  mainCurrency: Currency;
  note: string;
  cashIn: Record<string, number>;
  fxRates: Record<string, number>;
};

function nowMonth() { return new Date().toISOString().slice(0, 7); }
function fmtMonth(m: string) { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo)-1, 1).toLocaleDateString("en-AE", { month:"long", year:"numeric" }); }
function prevMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function nextMonth(m: string) { const [y,mo]=m.split("-").map(Number); const d=new Date(y,mo,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function fmtDateTime(iso: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleString("en-AE",{day:"2-digit",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"}); }
function toAed(amount: number, currency: Currency, rates: Record<string,number>): number {
  if (currency === "AED") return amount;
  const rate = rates[currency];
  if (!rate) return amount;
  return amount / rate;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(r: any): DueItem {
  return { id:r.id, name:r.name, group:r.group_name??"General", dueDay:r.due_day??null, defaultCurrency:(r.default_currency??"AED") as Currency, defaultAmount:r.default_amount??null, isFixed:r.is_fixed??false, isHidden:r.is_hidden??false, sortOrder:r.sort_order??0 };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEntry(r: any): DueEntry {
  return { id:r.id, dueItemId:r.due_item_id, month:r.month, amount:r.amount??null, currency:(r.currency??"AED") as Currency, status:(r.status??"pending") as Status, paidAt:r.paid_at??null, note:r.note??""};
}

export default function DueTrackerPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(nowMonth());
  const [items, setItems] = useState<DueItem[]>([]);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [settings, setSettings] = useState<MonthSettings>({ month, mainCurrency:"AED", note:"", cashIn:{}, fxRates:{ INR:25.2, USD:3.67 } });
  const [showAddItem, setShowAddItem] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string|null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [newItem, setNewItem] = useState({ name:"", group:"UAE", dueDay:"", defaultCurrency:"AED" as Currency, defaultAmount:"", isFixed:false });

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
    setSettings(s ? { month:m, mainCurrency:s.main_currency??"AED", note:s.note??"", cashIn:s.cash_in??{}, fxRates:s.fx_rates??{INR:25.2,USD:3.67} } : { month:m, mainCurrency:"AED", note:"", cashIn:{}, fxRates:{INR:25.2,USD:3.67} });
    markSynced();
  }

  async function changeMonth(m: string) {
    setMonth(m);
    if (userId) await loadAll(userId, m);
  }

  function getEntry(itemId: string): DueEntry | undefined {
    return entries.find(e => e.dueItemId === itemId);
  }

  async function ensureEntry(item: DueItem): Promise<DueEntry> {
    const existing = getEntry(item.id);
    if (existing) return existing;
    if (!userId) throw new Error("no user");
    // Copy from previous month if fixed
    let amount = item.defaultAmount;
    if (item.isFixed) {
      const prev = prevMonth(month);
      const { data } = await supabase.from("due_entries").select("*").eq("due_item_id", item.id).eq("month", prev).maybeSingle();
      if (data?.amount) amount = data.amount;
    }
    const { data } = await supabase.from("due_entries").insert({ user_id:userId, due_item_id:item.id, month, amount, currency:item.defaultCurrency, status:"pending", note:"" }).select("*").single();
    if (data) {
      const entry = dbToEntry(data);
      setEntries(p => [...p, entry]);
      return entry;
    }
    throw new Error("failed");
  }

  async function togglePaid(item: DueItem) {
    const entry = await ensureEntry(item);
    const newStatus: Status = entry.status === "paid" ? "pending" : "paid";
    const paidAt = newStatus === "paid" ? new Date().toISOString() : null;
    await supabase.from("due_entries").update({ status:newStatus, paid_at:paidAt }).eq("id", entry.id);
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, status:newStatus, paidAt } : e));
    showToast(newStatus === "paid" ? "✓ Marked as paid" : "Unmarked");

    if (newStatus === "paid" && userId) {
      // Add calendar event
      await supabase.from("calendar_events").insert({ user_id:userId, date:new Date().toISOString().slice(0,10), title:`Due paid: ${item.name}`, event_type:"due_paid", source_module:"due_tracker", source_id:entry.id, color:"#16a34a" });
    } else if (newStatus === "pending" && userId) {
      // Remove calendar event when unmarking
      await supabase.from("calendar_events").delete().eq("user_id", userId).eq("source_id", entry.id).eq("event_type", "due_paid");
    }
  }

  async function updateEntryAmount(item: DueItem, amount: string, currency: Currency) {
    const entry = await ensureEntry(item);
    const val = amount === "" ? null : parseFloat(amount);
    await supabase.from("due_entries").update({ amount:val, currency }).eq("id", entry.id);
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, amount:val, currency } : e));
  }

  async function updateEntryNote(item: DueItem, note: string) {
    const entry = await ensureEntry(item);
    await supabase.from("due_entries").update({ note }).eq("id", entry.id);
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, note } : e));
  }

  async function saveSettings() {
    if (!userId) return;
    await supabase.from("due_month_settings").upsert({ user_id:userId, month, main_currency:settings.mainCurrency, note:settings.note, cash_in:settings.cashIn, fx_rates:settings.fxRates }, { onConflict:"user_id,month" });
    showToast("Settings saved");
    setShowSettings(false);
  }

  async function addDueItem() {
    if (!userId || !newItem.name.trim()) return;
    const { data } = await supabase.from("due_items").insert({ user_id:userId, name:newItem.name.trim(), group_name:newItem.group, due_day:newItem.dueDay?parseInt(newItem.dueDay):null, default_currency:newItem.defaultCurrency, default_amount:newItem.defaultAmount?parseFloat(newItem.defaultAmount):null, is_fixed:newItem.isFixed }).select("*").single();
    if (data) {
      setItems(p => [...p, dbToItem(data)]);
      setNewItem({ name:"", group:"UAE", dueDay:"", defaultCurrency:"AED", defaultAmount:"", isFixed:false });
      setShowAddItem(false);
      showToast("Due item added");
    }
  }

  async function toggleHideItem(item: DueItem) {
    await supabase.from("due_items").update({ is_hidden:!item.isHidden }).eq("id", item.id);
    setItems(p => p.map(x => x.id === item.id ? { ...x, isHidden:!x.isHidden } : x));
    showToast(item.isHidden ? "Item shown" : "Item hidden");
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  // ── Stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const visibleItems = items.filter(x => !x.isHidden || showHidden);
    const allItems = items; // always calculate with all items

    let totalAed = 0, paidAed = 0, pendingCount = 0, paidCount = 0;
    const fxRates = settings.fxRates;

    for (const item of allItems) {
      const entry = getEntry(item.id);
      const amount = entry?.amount ?? item.defaultAmount ?? 0;
      const currency = (entry?.currency ?? item.defaultCurrency) as Currency;
      const aed = toAed(amount, currency, fxRates);
      totalAed += aed;
      if (entry?.status === "paid") { paidAed += aed; paidCount++; }
      else { pendingCount++; }
    }

    return { totalAed, paidAed, pendingAed: totalAed - paidAed, paidCount, pendingCount, visibleItems };
  }, [items, entries, settings]);

  // Group visible items
  const groups = useMemo(() => {
    const visible = showHidden ? items : items.filter(x => !x.isHidden);
    const map = new Map<string, DueItem[]>();
    for (const item of visible) {
      const g = item.group || "General";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return map;
  }, [items, showHidden]);

  const V = {
    bg: isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff",
    border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)",
    text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280",
    faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb",
    accent:"#F5A623",
  };
  const btn = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnPrimary = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;

  function toggleGroup(group: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  }

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
          <button style={btnPrimary} onClick={() => setShowAddItem(true)}>+ Add due</button>
        </div>
      </div>

      {/* Month nav */}
      <div style={{ padding:"16px 24px 0", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <button style={btn} onClick={() => changeMonth(prevMonth(month))}>‹</button>
        <span style={{ fontSize:18, fontWeight:700, minWidth:180, textAlign:"center" }}>{fmtMonth(month)}</span>
        <button style={btn} onClick={() => changeMonth(nextMonth(month))}>›</button>
        <button style={{ ...btn, fontSize:12, padding:"6px 12px" }} onClick={() => changeMonth(nowMonth())}>Today</button>
      </div>

      {/* Stats cards */}
      <div style={{ padding:"14px 24px 0", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 }}>
        {[
          { label:"Total due", value:`AED ${stats.totalAed.toFixed(0)}`, color:V.accent },
          { label:"Paid", value:`AED ${stats.paidAed.toFixed(0)}`, color:"#16a34a" },
          { label:"Pending", value:`AED ${stats.pendingAed.toFixed(0)}`, color:"#ef4444" },
          { label:"Items", value:`${stats.paidCount}/${stats.paidCount+stats.pendingCount} paid`, color:V.muted },
        ].map(s => (
          <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Month note */}
      {settings.note && (
        <div style={{ margin:"12px 24px 0", padding:"10px 14px", background:"rgba(245,166,35,0.08)", border:"1px solid rgba(245,166,35,0.2)", borderRadius:10, fontSize:13, color:V.text }}>
          📝 {settings.note}
        </div>
      )}

      {/* Due items by group */}
      <div style={{ padding:"16px 24px 24px", display:"flex", flexDirection:"column", gap:16 }}>
        {Array.from(groups.entries()).map(([group, groupItems]) => {
          const groupEntries = groupItems.map(item => ({ item, entry: getEntry(item.id) }));
          const groupTotalAed = groupEntries.reduce((s,{item,entry}) => {
            const amt = entry?.amount ?? item.defaultAmount ?? 0;
            const cur = (entry?.currency ?? item.defaultCurrency) as Currency;
            return s + toAed(amt, cur, settings.fxRates);
          }, 0);
          const groupPaidAed = groupEntries.filter(({entry})=>entry?.status==="paid").reduce((s,{item,entry})=>{
            const amt = entry?.amount ?? item.defaultAmount ?? 0;
            const cur = (entry?.currency ?? item.defaultCurrency) as Currency;
            return s + toAed(amt,cur,settings.fxRates);
          },0);

          return (
            <div key={group} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
              {/* Group header — clickable to collapse */}
              <div onClick={() => toggleGroup(group)} style={{ padding:"12px 16px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)", cursor:"pointer", userSelect:"none" }}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <span style={{ fontSize:13, color:V.faint, transition:"transform 0.2s", display:"inline-block", transform:collapsedGroups.has(group)?"rotate(-90deg)":"rotate(0deg)" }}>▾</span>
                  <span style={{ fontSize:14, fontWeight:800 }}>{group}</span>
                  <span style={{ fontSize:11, color:V.faint }}>{groupItems.length} items</span>
                </div>
                <div style={{ display:"flex", gap:16, fontSize:12, color:V.muted }} onClick={e=>e.stopPropagation()}>
                  <span>Total: <strong style={{ color:V.text }}>AED {groupTotalAed.toFixed(0)}</strong></span>
                  <span>Paid: <strong style={{ color:"#16a34a" }}>AED {groupPaidAed.toFixed(0)}</strong></span>
                  <span>Pending: <strong style={{ color:"#ef4444" }}>AED {(groupTotalAed-groupPaidAed).toFixed(0)}</strong></span>
                </div>
              </div>

              {/* Items — hidden when collapsed */}
              {!collapsedGroups.has(group) && groupItems.map(item => {
                const entry = getEntry(item.id);
                const isPaid = entry?.status === "paid";
                const isEditing = editEntryId === item.id;
                const displayAmt = entry?.amount ?? item.defaultAmount ?? 0;
                const displayCur = (entry?.currency ?? item.defaultCurrency) as Currency;

                return (
                  <div key={item.id} style={{ padding:"12px 16px", borderBottom:`1px solid ${V.border}`, opacity:item.isHidden?0.5:1 }}>
                    <div style={{ display:"flex", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
                      {/* Checkbox */}
                      <button onClick={() => togglePaid(item)} style={{ width:22, height:22, borderRadius:6, border:`2px solid ${isPaid?"#16a34a":V.border}`, background:isPaid?"#16a34a":"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                        {isPaid && <span style={{ color:"#fff", fontSize:12, fontWeight:800 }}>✓</span>}
                      </button>

                      {/* Name + day */}
                      <div style={{ flex:1, minWidth:120 }}>
                        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                          <span style={{ fontSize:14, fontWeight:700, textDecoration:isPaid?"line-through":"none", color:isPaid?V.faint:V.text }}>{item.name}</span>
                          {item.dueDay && <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"rgba(245,166,35,0.1)", color:V.accent }}>{item.dueDay}{item.dueDay===1?"st":item.dueDay===2?"nd":item.dueDay===3?"rd":"th"}</span>}
                          {item.isFixed && <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"rgba(99,102,241,0.1)", color:"#6366f1" }}>Fixed</span>}
                          {item.isHidden && <span style={{ fontSize:10, color:V.faint }}>(hidden)</span>}
                        </div>
                        {isPaid && entry?.paidAt && <div style={{ fontSize:11, color:"#16a34a", marginTop:3 }}>Paid: {fmtDateTime(entry.paidAt)}</div>}
                        {isEditing && entry?.note !== undefined && (
                          <input
                            placeholder="Add note…"
                            defaultValue={entry.note}
                            onBlur={e => updateEntryNote(item, e.target.value)}
                            style={{ ...inp, width:"100%", marginTop:6, fontSize:12 }}
                          />
                        )}
                      </div>

                      {/* Amount + currency */}
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        {isEditing ? (
                          <>
                            <input
                              type="number"
                              defaultValue={displayAmt || ""}
                              placeholder="Amount"
                              onBlur={e => updateEntryAmount(item, e.target.value, displayCur)}
                              style={{ ...inp, width:100, textAlign:"right" }}
                            />
                            <select defaultValue={displayCur} onChange={e => updateEntryAmount(item, String(displayAmt), e.target.value as Currency)} style={{ ...inp, width:70 }}>
                              <option>AED</option><option>INR</option><option>USD</option>
                            </select>
                          </>
                        ) : (
                          <span style={{ fontSize:14, fontWeight:700, color:V.text }}>
                            {displayCur} {displayAmt ? displayAmt.toLocaleString() : <span style={{ color:V.faint }}>—</span>}
                            {displayCur !== "AED" && displayAmt > 0 && (
                              <span style={{ fontSize:11, color:V.faint, marginLeft:6 }}>≈ AED {toAed(displayAmt, displayCur, settings.fxRates).toFixed(0)}</span>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => router.push(`/dashboard/budget/${item.id}`)} style={{ ...btn, padding:"5px 10px", fontSize:11, color:V.accent }}>
                          Stats
                        </button>
                        <button onClick={() => setEditEntryId(isEditing ? null : item.id)} style={{ ...btn, padding:"5px 10px", fontSize:11, color:isEditing?V.accent:V.muted }}>
                          {isEditing ? "Done" : "Edit"}
                        </button>
                        <button onClick={() => toggleHideItem(item)} style={{ ...btn, padding:"5px 10px", fontSize:11, color:V.faint }}>
                          {item.isHidden ? "Show" : "Hide"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {groups.size === 0 && (
          <div style={{ padding:"60px 0", textAlign:"center", color:V.faint }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:16, fontWeight:600, color:V.muted }}>No due items yet</div>
            <div style={{ fontSize:13, marginTop:6 }}>Click + Add due to get started</div>
          </div>
        )}
      </div>

      {/* ── Add item modal ── */}
      {showAddItem && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowAddItem(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(520px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add due item</div>
              <button style={btn} onClick={()=>setShowAddItem(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", gridColumn:"1/-1" }}>
                Name
                <input style={{ ...inp, width:"100%", boxSizing:"border-box" }} value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="e.g. Rent" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Group
                <input style={{ ...inp, width:"100%", boxSizing:"border-box" }} value={newItem.group} onChange={e=>setNewItem(p=>({...p,group:e.target.value}))} placeholder="UAE" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Due day
                <input style={inp} type="number" min="1" max="31" value={newItem.dueDay} onChange={e=>setNewItem(p=>({...p,dueDay:e.target.value}))} placeholder="e.g. 14" />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Currency
                <select style={inp} value={newItem.defaultCurrency} onChange={e=>setNewItem(p=>({...p,defaultCurrency:e.target.value as Currency}))}>
                  <option>AED</option><option>INR</option><option>USD</option>
                </select>
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Default amount
                <input style={inp} type="number" value={newItem.defaultAmount} onChange={e=>setNewItem(p=>({...p,defaultAmount:e.target.value}))} placeholder="Optional" />
              </label>
              <label style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, fontWeight:600, color:V.text, cursor:"pointer" }}>
                <input type="checkbox" checked={newItem.isFixed} onChange={e=>setNewItem(p=>({...p,isFixed:e.target.checked}))} />
                Fixed amount (repeats each month)
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowAddItem(false)}>Cancel</button>
              <button style={btnPrimary} onClick={addDueItem}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings modal ── */}
      {showSettings && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowSettings(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(560px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:11, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.1em" }}>{fmtMonth(month)}</div><div style={{ fontSize:18, fontWeight:800 }}>Month settings</div></div>
              <button style={btn} onClick={()=>setShowSettings(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:16 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Main currency
                <select style={inp} value={settings.mainCurrency} onChange={e=>setSettings(p=>({...p,mainCurrency:e.target.value as Currency}))}>
                  <option>AED</option><option>INR</option><option>USD</option>
                </select>
              </label>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Exchange rates (to AED)</div>
                {(["INR","USD"] as const).map(cur => (
                  <div key={cur} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:600, width:40 }}>{cur}:</span>
                    <span style={{ fontSize:13, color:V.faint }}>1 AED =</span>
                    <input type="number" style={{ ...inp, width:80 }} value={settings.fxRates[cur]??""} onChange={e=>setSettings(p=>({...p,fxRates:{...p.fxRates,[cur]:parseFloat(e.target.value)||0}}))} placeholder="rate" />
                    <span style={{ fontSize:13, color:V.faint }}>{cur}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Cash in (received this month)</div>
                {(["AED","INR","USD"] as const).map(cur => (
                  <div key={cur} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:600, width:40 }}>{cur}:</span>
                    <input type="number" style={{ ...inp, width:120 }} value={settings.cashIn[cur]??""} onChange={e=>setSettings(p=>({...p,cashIn:{...p.cashIn,[cur]:parseFloat(e.target.value)||0}}))} placeholder="0" />
                  </div>
                ))}
              </div>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Month note
                <textarea style={{ ...inp, resize:"vertical", minHeight:80, lineHeight:1.5 }} value={settings.note} onChange={e=>setSettings(p=>({...p,note:e.target.value}))} placeholder="Any notes for this month…" />
              </label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowSettings(false)}>Cancel</button>
              <button style={btnPrimary} onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
