"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Currency = "AED" | "INR" | "USD";
type Status = "pending" | "paid" | "skipped";

type DueItem = {
  id: string; name: string; group: string; dueDay: number | null;
  defaultCurrency: Currency; defaultAmount: number | null;
  isFixed: boolean; statementDate: number | null;
};

type DueEntry = {
  id: string; month: string; amount: number | null; currency: Currency;
  status: Status; paidAt: string | null; note: string;
};

type FxRates = Record<string, number>;

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo)-1, 1).toLocaleDateString("en-AE", { month:"long", year:"numeric" });
}
function fmtDateTime(iso: string|null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", { day:"2-digit", month:"short", year:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function toAed(amount: number, currency: Currency, rates: FxRates) {
  if (currency === "AED") return amount;
  const rate = rates[currency];
  return rate ? amount / rate : amount;
}
function nowMonth() { return new Date().toISOString().slice(0, 7); }
function addMonths(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

export default function DueItemDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string|null>(null);
  const [item, setItem] = useState<DueItem|null>(null);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [fxRates, setFxRates] = useState<FxRates>({ INR: 25.2, USD: 3.67 });
  const [loading, setLoading] = useState(true);
  const [statementDay, setStatementDay] = useState<string>("");
  const [editingStatement, setEditingStatement] = useState(false);
  const [toast, setToast] = useState("");

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
        setItem({ id:r.id, name:r.name, group:r.group_name??"General", dueDay:r.due_day??null, defaultCurrency:(r.default_currency??"AED") as Currency, defaultAmount:r.default_amount??null, isFixed:r.is_fixed??false, statementDate:r.statement_date??null });
        setStatementDay(r.statement_date ? String(r.statement_date) : "");
      }
      if (entriesRes.data) {
        setEntries(entriesRes.data.map((e: {id:string;month:string;amount:number|null;currency:string;status:string;paid_at:string|null;note:string}) => ({ id:e.id, month:e.month, amount:e.amount??null, currency:(e.currency??"AED") as Currency, status:(e.status??"pending") as Status, paidAt:e.paid_at??null, note:e.note??"" })));
      }
      if (settingsRes.data?.fx_rates) setFxRates(settingsRes.data.fx_rates as FxRates);
      setLoading(false);
    }
    load();
  }, [params.id]);

  async function saveStatementDate() {
    if (!item) return;
    const day = statementDay ? parseInt(statementDay) : null;
    await supabase.from("due_items").update({ statement_date: day }).eq("id", item.id);
    setItem(p => p ? { ...p, statementDate: day } : p);
    setEditingStatement(false);
    showToast("Statement date saved");

    // Add/update calendar event for this month
    if (day && userId) {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      // Remove old statement calendar events for this item
      await supabase.from("calendar_events").delete().eq("user_id", userId).eq("source_module", "due_statement").eq("source_id", item.id);
      // Add new one
      await supabase.from("calendar_events").insert({ user_id:userId, date:dateStr, title:`Statement: ${item.name}`, event_type:"event", source_module:"due_statement", source_id:item.id, color:"#f97316", is_recurring:true, recur_type:"monthly" });
      showToast("Statement date saved + added to calendar");
    }
  }

  // Generate upcoming 6 months
  const upcoming = Array.from({ length: 6 }).map((_, i) => {
    const m = addMonths(nowMonth(), i);
    const entry = entries.find(e => e.month === m);
    return { month: m, entry };
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  const totalPaid = entries.filter(e => e.status === "paid").reduce((s, e) => s + toAed(e.amount??0, e.currency, fxRates), 0);
  const paidCount = entries.filter(e => e.status === "paid").length;
  const avgAmount = paidCount > 0 ? totalPaid / paidCount : 0;

  const V = {
    bg: isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff",
    border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)",
    text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280",
    faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623",
  };
  const sectionStyle = { background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden", marginBottom:16 };
  const headStyle = { padding:"12px 16px", borderBottom:`1px solid ${V.border}`, fontSize:11, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:V.faint, background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)" };
  const btn = { padding:"7px 14px", borderRadius:9, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:12, fontWeight:600 } as const;
  const btnPrimary = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;

  if (loading) return <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background:V.bg }}><div style={{ width:28, height:28, border:`2.5px solid ${V.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if (!item) return <div style={{ padding:40, background:V.bg, minHeight:"100vh", color:V.muted }}>Item not found</div>;

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>
      {/* Top nav */}
      <div style={{ position:"sticky", top:0, zIndex:20, background:isDark?"rgba(13,15,20,0.9)":"rgba(249,248,245,0.9)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${V.border}`, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <Link href="/dashboard/budget" style={{ display:"flex", alignItems:"center", gap:8, color:V.muted, textDecoration:"none", fontWeight:600, fontSize:13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Due Tracker
        </Link>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999, background:"rgba(245,166,35,0.12)", color:V.accent }}>{item.group}</span>
        </div>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"24px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom:22 }}>
          <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.5px", margin:"0 0 6px" }}>{item.name}</h1>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
            {item.dueDay && <span style={{ fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:999, background:"rgba(245,166,35,0.12)", color:V.accent }}>Due {item.dueDay}{item.dueDay===1?"st":item.dueDay===2?"nd":item.dueDay===3?"rd":"th"} of month</span>}
            {item.isFixed && <span style={{ fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:999, background:"rgba(99,102,241,0.1)", color:"#6366f1" }}>Fixed amount</span>}
            {item.defaultAmount && <span style={{ fontSize:12, color:V.muted }}>Default: {item.defaultCurrency} {item.defaultAmount.toLocaleString()}</span>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10, marginBottom:20 }}>
          {[
            { label:"Total paid (AED)", value:`AED ${totalPaid.toFixed(0)}`, color:V.accent },
            { label:"Months paid", value:paidCount, color:"#16a34a" },
            { label:"Average / month", value:avgAmount > 0 ? `AED ${avgAmount.toFixed(0)}` : "—", color:V.muted },
            { label:"Total records", value:entries.length, color:V.faint },
          ].map(s => (
            <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Statement date */}
        <div style={sectionStyle}>
          <div style={headStyle}>Statement date</div>
          <div style={{ padding:"14px 16px", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
            {editingStatement ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, color:V.muted }}>Day of month:</span>
                  <input type="number" min="1" max="31" style={{ ...inp, width:70 }} value={statementDay} onChange={e => setStatementDay(e.target.value)} placeholder="e.g. 14" />
                </div>
                <button style={btnPrimary} onClick={saveStatementDate}>Save & add to calendar</button>
                <button style={btn} onClick={() => setEditingStatement(false)}>Cancel</button>
              </>
            ) : (
              <>
                {item.statementDate
                  ? <span style={{ fontSize:14, fontWeight:700, color:V.text }}>Every {item.statementDate}{item.statementDate===1?"st":item.statementDate===2?"nd":item.statementDate===3?"rd":"th"} of the month</span>
                  : <span style={{ fontSize:13, color:V.faint }}>No statement date set</span>
                }
                <button style={btn} onClick={() => setEditingStatement(true)}>
                  {item.statementDate ? "Edit" : "Set statement date"}
                </button>
              </>
            )}
            <span style={{ fontSize:11, color:V.faint }}>Setting this adds a recurring event to your calendar</span>
          </div>
        </div>

        {/* Upcoming months */}
        <div style={sectionStyle}>
          <div style={headStyle}>Upcoming 6 months</div>
          {upcoming.map(({ month: m, entry }) => {
            const isPaid = entry?.status === "paid";
            const isPending = !entry || entry.status === "pending";
            return (
              <div key={m} style={{ padding:"11px 16px", borderBottom:`1px solid ${V.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:isPaid?"#16a34a":isPending?"#ef4444":"#9ca3af", flexShrink:0 }}/>
                  <span style={{ fontSize:14, fontWeight:600 }}>{fmtMonth(m)}</span>
                  {m === nowMonth() && <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:999, background:"rgba(245,166,35,0.12)", color:V.accent }}>Current</span>}
                </div>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  {entry ? (
                    <span style={{ fontSize:13, fontWeight:700, color:V.text }}>{entry.currency} {entry.amount?.toLocaleString() ?? "—"}</span>
                  ) : (
                    <span style={{ fontSize:12, color:V.faint }}>{item.defaultCurrency} {item.defaultAmount?.toLocaleString() ?? "—"} (default)</span>
                  )}
                  <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999,
                    background:isPaid?"rgba(22,163,74,0.12)":"rgba(239,68,68,0.08)",
                    color:isPaid?"#16a34a":"#ef4444" }}>
                    {isPaid ? `✓ Paid ${fmtDateTime(entry?.paidAt??null)}` : "Pending"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Payment history */}
        <div style={sectionStyle}>
          <div style={headStyle}>Payment history ({entries.length} months)</div>
          {entries.length === 0 && <div style={{ padding:"24px 16px", textAlign:"center", color:V.faint, fontSize:13 }}>No payment history yet</div>}
          {entries.map(entry => {
            const isPaid = entry.status === "paid";
            return (
              <div key={entry.id} style={{ padding:"11px 16px", borderBottom:`1px solid ${V.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:isPaid?"#16a34a":"#9ca3af", flexShrink:0 }}/>
                  <span style={{ fontSize:14, fontWeight:600 }}>{fmtMonth(entry.month)}</span>
                </div>
                <div style={{ display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, fontWeight:700 }}>{entry.currency} {entry.amount?.toLocaleString() ?? "—"}</span>
                  {entry.currency !== "AED" && entry.amount && <span style={{ fontSize:11, color:V.faint }}>≈ AED {toAed(entry.amount, entry.currency, fxRates).toFixed(0)}</span>}
                  <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999, background:isPaid?"rgba(22,163,74,0.12)":"rgba(107,114,128,0.1)", color:isPaid?"#16a34a":V.faint }}>
                    {isPaid ? "Paid" : entry.status}
                  </span>
                  {isPaid && <span style={{ fontSize:11, color:V.faint }}>{fmtDateTime(entry.paidAt)}</span>}
                  {entry.note && <span style={{ fontSize:11, color:V.muted, fontStyle:"italic" }}>{entry.note}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}
