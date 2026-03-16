"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { nowDubai, todayDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Currency = "AED" | "INR" | "USD";
type Status = "pending" | "paid" | "skipped";

type DueItem = {
  id: string; name: string; group: string; dueDay: number | null;
  statementDay: number | null; defaultCurrency: Currency;
  defaultAmount: number | null; isFixed: boolean;
};

type DueEntry = {
  id: string; month: string; amount: number | null; currency: Currency;
  status: Status; paidAt: string | null; note: string;
};

function fmtMonth(m: string) { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo)-1, 1).toLocaleDateString("en-AE", { month:"long", year:"numeric" }); }
function fmtDateTime(iso: string|null) { if (!iso) return "—"; return new Date(iso).toLocaleString("en-AE", { day:"2-digit", month:"short", year:"2-digit", hour:"2-digit", minute:"2-digit" }); }
function toAed(amount: number, currency: Currency, rates: Record<string,number>) { if (currency === "AED") return amount; return rates[currency] ? amount / rates[currency] : amount; }
function nowMonth() { return nowDubai().slice(0, 7); }
function addMonths(m: string, n: number) { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function ordinal(n: number) { const s=["th","st","nd","rd"]; const v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

export default function DueItemDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string|null>(null);
  const [item, setItem] = useState<DueItem|null>(null);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [fxRates, setFxRates] = useState<Record<string,number>>({ INR: 25.2, USD: 3.67 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Editing entry
  const [editingMonth, setEditingMonth] = useState<string|null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState<Currency>("AED");
  const [editNote, setEditNote] = useState("");

  // Add month
  const [showAddMonth, setShowAddMonth] = useState(false);
  const [newMonth, setNewMonth] = useState(nowMonth());
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState<Currency>("AED");
  const [newNote, setNewNote] = useState("");

  // Edit item dates
  const [editStatDay, setEditStatDay] = useState("");
  const [editDueDay, setEditDueDay] = useState("");
  const [editingDates, setEditingDates] = useState(false);

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const [itemRes, entriesRes, settingsRes] = await Promise.all([
        supabase.from("due_items").select("*").eq("id", params.id).single(),
        supabase.from("due_entries").select("*").eq("due_item_id", params.id).order("month", { ascending: false }),
        supabase.from("due_month_settings").select("fx_rates").eq("user_id", user.id).eq("month", nowMonth()).maybeSingle(),
      ]);

      if (itemRes.data) {
        const r = itemRes.data;
        const it: DueItem = { id:r.id, name:r.name, group:r.group_name??"General", dueDay:r.due_date_day??r.due_day??null, statementDay:r.statement_date??null, defaultCurrency:(r.default_currency??"AED") as Currency, defaultAmount:r.default_amount??null, isFixed:r.is_fixed??false };
        setItem(it);
        setEditStatDay(it.statementDay?.toString()??"");
        setEditDueDay(it.dueDay?.toString()??"");
      }
      if (entriesRes.data) {
        setEntries(entriesRes.data.map((e: {id:string;month:string;amount:number|null;currency:string;status:string;paid_at:string|null;note:string}) => ({ id:e.id, month:e.month, amount:e.amount??null, currency:(e.currency??"AED") as Currency, status:(e.status??"pending") as Status, paidAt:e.paid_at??null, note:e.note??"" })));
      }
      if (settingsRes.data?.fx_rates) setFxRates(settingsRes.data.fx_rates as Record<string,number>);
      setLoading(false);
    }
    load();
  }, [params.id]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function saveDates() {
    if (!item) return;
    const sd = editStatDay ? parseInt(editStatDay) : null;
    const dd = editDueDay ? parseInt(editDueDay) : null;
    await supabase.from("due_items").update({ statement_date: sd, due_date_day: dd }).eq("id", item.id);
    setItem(p => p ? { ...p, statementDay: sd, dueDay: dd } : p);
    setEditingDates(false);
    showToast("Dates saved");
  }

  function startEdit(entry: DueEntry) {
    setEditingMonth(entry.month);
    setEditAmount(entry.amount?.toString() ?? "");
    setEditCurrency(entry.currency);
    setEditNote(entry.note ?? "");
  }

  async function saveEdit(entry: DueEntry) {
    const amount = editAmount === "" ? null : parseFloat(editAmount);
    await supabase.from("due_entries").update({ amount, currency:editCurrency, note:editNote }).eq("id", entry.id);
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, amount, currency:editCurrency, note:editNote } : e));
    setEditingMonth(null);
    showToast("Updated");
  }

  async function addMissingMonth() {
    if (!userId || !item) return;
    if (entries.find(e => e.month === newMonth)) { showToast("Month already exists"); return; }
    const amount = newAmount === "" ? item.defaultAmount : parseFloat(newAmount);
    const { data } = await supabase.from("due_entries").insert({ user_id:userId, due_item_id:item.id, month:newMonth, amount, currency:newCurrency, status:"pending", note:newNote }).select("*").single();
    if (data) {
      const entry: DueEntry = { id:data.id, month:data.month, amount:data.amount??null, currency:(data.currency??"AED") as Currency, status:"pending", paidAt:null, note:data.note??"" };
      setEntries(p => [entry, ...p].sort((a,b) => b.month.localeCompare(a.month)));
      setShowAddMonth(false); setNewMonth(nowMonth()); setNewAmount(""); setNewNote("");
      showToast("Month added");
    }
  }

  async function togglePaid(entry: DueEntry) {
    const newStatus: Status = entry.status === "paid" ? "pending" : "paid";
    const paidAt = newStatus === "paid" ? nowDubai() : null;
    await supabase.from("due_entries").update({ status:newStatus, paid_at:paidAt }).eq("id", entry.id);
    setEntries(p => p.map(e => e.id === entry.id ? { ...e, status:newStatus, paidAt } : e));
  }

  // Stats in original currency
  const nativeCurrency = item?.defaultCurrency ?? "AED";
  const stats = useMemo(() => {
    if (!item) return null;
    const paid = entries.filter(e => e.status === "paid");
    // Total in original currency
    let totalNative = 0;
    for (const e of paid) {
      const amt = e.amount ?? 0;
      if (e.currency === nativeCurrency) totalNative += amt;
      else if (nativeCurrency === "AED") totalNative += toAed(amt, e.currency, fxRates);
      else totalNative += toAed(amt, e.currency, fxRates) * (fxRates[nativeCurrency] ?? 1);
    }
    const avg = paid.length > 0 ? totalNative / paid.length : 0;

    // Missing months
    const existingMonths = new Set(entries.map(e => e.month));
    const firstMonth = entries.length > 0 ? entries[entries.length-1].month : nowMonth();
    const allMonths: string[] = [];
    let cur = firstMonth;
    while (cur <= nowMonth()) { allMonths.push(cur); cur = addMonths(cur, 1); }
    const missing = allMonths.filter(m => !existingMonths.has(m));

    return { totalNative, avg, paidCount: paid.length, missing };
  }, [entries, item, fxRates, nativeCurrency]);

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623" };
  const btn = { padding:"7px 13px", borderRadius:9, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:12, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;
  const section = { background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" as const, marginBottom:16 };
  const sHead = { padding:"11px 16px", borderBottom:`1px solid ${V.border}`, fontSize:11, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:V.faint, background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)" };

  if (loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if (!item) return <div style={{padding:40,background:V.bg,minHeight:"100vh",color:V.muted}}>Not found. <Link href="/dashboard/budget" style={{color:V.accent}}>Back</Link></div>;

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>
      {/* Nav */}
      <div style={{ position:"sticky", top:0, zIndex:20, background:isDark?"rgba(13,15,20,0.9)":"rgba(249,248,245,0.9)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${V.border}`, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <Link href="/dashboard/budget" style={{ display:"flex", alignItems:"center", gap:8, color:V.muted, textDecoration:"none", fontWeight:600, fontSize:13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Due Tracker
        </Link>
        <button style={btnP} onClick={() => { setNewCurrency(item.defaultCurrency); setShowAddMonth(true); }}>+ Add month</button>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"24px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8 }}>
            <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.5px", margin:0 }}>{item.name}</h1>
            <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999, background:"rgba(245,166,35,0.12)", color:V.accent }}>{item.group}</span>
            {item.isFixed && <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999, background:"rgba(99,102,241,0.1)", color:"#6366f1" }}>Fixed</span>}
          </div>

          {/* Statement & Due dates - editable */}
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:editingDates?12:0 }}>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                {!editingDates ? (
                  <>
                    {item.statementDay
                      ? <span style={{ fontSize:13, fontWeight:700 }}>📋 Statement: <span style={{ color:"#F5A623" }}>{ordinal(item.statementDay)}</span></span>
                      : <span style={{ fontSize:13, color:V.faint }}>No statement date</span>
                    }
                    {item.dueDay
                      ? <span style={{ fontSize:13, fontWeight:700 }}>📅 Due: <span style={{ color:"#ef4444" }}>{ordinal(item.dueDay)}</span></span>
                      : <span style={{ fontSize:13, color:V.faint }}>No due date</span>
                    }
                  </>
                ) : (
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                    <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:13, fontWeight:600 }}>
                      <span style={{ color:"#F5A623" }}>Statement day:</span>
                      <input type="number" min="1" max="31" style={{ ...inp, width:70, padding:"5px 8px" }} value={editStatDay} onChange={e=>setEditStatDay(e.target.value)} placeholder="e.g. 22" />
                    </label>
                    <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:13, fontWeight:600 }}>
                      <span style={{ color:"#ef4444" }}>Due day:</span>
                      <input type="number" min="1" max="31" style={{ ...inp, width:70, padding:"5px 8px" }} value={editDueDay} onChange={e=>setEditDueDay(e.target.value)} placeholder="e.g. 10" />
                    </label>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {editingDates ? (
                  <>
                    <button style={btnP} onClick={saveDates}>Save</button>
                    <button style={btn} onClick={()=>setEditingDates(false)}>Cancel</button>
                  </>
                ) : (
                  <button style={btn} onClick={()=>setEditingDates(true)}>Edit dates</button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats in native currency */}
        {stats && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10, marginBottom:20 }}>
            {[
              { label:`Total paid (${nativeCurrency})`, value:`${nativeCurrency} ${stats.totalNative.toFixed(0)}`, color:V.accent },
              { label:"Months paid",                    value:stats.paidCount,                                    color:"#16a34a" },
              { label:`Avg / month (${nativeCurrency})`,value:`${nativeCurrency} ${stats.avg.toFixed(0)}`,        color:V.muted },
              { label:"Total records",                  value:entries.length,                                     color:V.faint },
            ].map(s => (
              <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"11px 14px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Missing months */}
        {stats && stats.missing.length > 0 && (
          <div style={{ marginBottom:16, padding:"12px 16px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#ef4444" }}>Missing {stats.missing.length} month{stats.missing.length>1?"s":""}</div>
              <div style={{ fontSize:11, color:V.faint, marginTop:2 }}>{stats.missing.slice(0,4).map(fmtMonth).join(", ")}{stats.missing.length>4?` +${stats.missing.length-4} more`:""}</div>
            </div>
            <button style={{ ...btnP, background:"#ef4444" }} onClick={() => { setNewCurrency(item.defaultCurrency); setNewMonth(stats.missing[0]); setShowAddMonth(true); }}>Add missing</button>
          </div>
        )}

        {/* Entry list */}
        <div style={section}>
          <div style={{ ...sHead, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>All months ({entries.length})</span>
          </div>
          {entries.length === 0 && <div style={{ padding:"24px 16px", textAlign:"center", color:V.faint, fontSize:13 }}>No records yet · click + Add month</div>}
          {entries.map(entry => {
            const isPaid = entry.status === "paid";
            const isEditing = editingMonth === entry.month;
            const aed = toAed(entry.amount??0, entry.currency, fxRates);

            return (
              <div key={entry.id} style={{ padding:"12px 16px", borderBottom:`1px solid ${V.border}` }}>
                {isEditing ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{fmtMonth(entry.month)}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 80px", gap:8 }}>
                      <input type="number" style={inp} value={editAmount} onChange={e=>setEditAmount(e.target.value)} placeholder="Amount" />
                      <select style={inp} value={editCurrency} onChange={e=>setEditCurrency(e.target.value as Currency)}>
                        <option>AED</option><option>INR</option><option>USD</option>
                      </select>
                    </div>
                    <input style={inp} value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="Note (optional)" />
                    <div style={{ display:"flex", gap:8 }}>
                      <button style={btnP} onClick={() => saveEdit(entry)}>Save</button>
                      <button style={btn} onClick={() => setEditingMonth(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <button onClick={() => togglePaid(entry)} style={{ width:20, height:20, borderRadius:5, border:`2px solid ${isPaid?"#16a34a":V.border}`, background:isPaid?"#16a34a":"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {isPaid && <span style={{ color:"#fff", fontSize:10, fontWeight:800 }}>✓</span>}
                      </button>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700 }}>{fmtMonth(entry.month)}</div>
                        {entry.note && <div style={{ fontSize:11, color:V.muted, fontStyle:"italic", marginTop:2 }}>{entry.note}</div>}
                        {isPaid && <div style={{ fontSize:11, color:"#16a34a", marginTop:2 }}>Paid: {fmtDateTime(entry.paidAt)}</div>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:14, fontWeight:700, color:entry.amount===0?"#16a34a":V.text }}>
                          {entry.amount===0 ? "✓ 0" : `${entry.currency} ${entry.amount?.toLocaleString()??""}`}
                        </div>
                        {entry.currency !== "AED" && entry.amount && <div style={{ fontSize:11, color:V.faint }}>≈ AED {aed.toFixed(0)}</div>}
                        <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, display:"inline-block", marginTop:3, background:isPaid?"rgba(22,163,74,0.12)":"rgba(239,68,68,0.08)", color:isPaid?"#16a34a":"#ef4444" }}>
                          {isPaid?"Paid":"Pending"}
                        </span>
                      </div>
                      <button style={btn} onClick={() => startEdit(entry)}>Edit</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add month modal */}
      {showAddMonth && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowAddMonth(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(460px,100%)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add month record</div>
              <button style={btn} onClick={()=>setShowAddMonth(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Month <input type="month" style={inp} value={newMonth} onChange={e=>setNewMonth(e.target.value)} />
              </label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 80px", gap:8 }}>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Amount <input type="number" style={inp} value={newAmount} onChange={e=>setNewAmount(e.target.value)} placeholder={`Default: ${item.defaultAmount??0}`} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  Cur <select style={inp} value={newCurrency} onChange={e=>setNewCurrency(e.target.value as Currency)}><option>AED</option><option>INR</option><option>USD</option></select>
                </label>
              </div>
              <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Note <input style={inp} value={newNote} onChange={e=>setNewNote(e.target.value)} />
              </label>
              {stats && stats.missing.length > 0 && (
                <div style={{ fontSize:12, color:V.faint }}>
                  Missing: {stats.missing.slice(0,6).map(m => (
                    <button key={m} onClick={() => setNewMonth(m)} style={{ ...btn, padding:"2px 8px", fontSize:11, marginLeft:4, color:newMonth===m?V.accent:V.muted }}>{m}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowAddMonth(false)}>Cancel</button>
              <button style={btnP} onClick={addMissingMonth}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}
