"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Currency = "AED"|"INR"|"USD";
type Status = "pending"|"paid";

type MonthRecord = {
  month: string;
  indiaTotalInr: number;
  fxRate: number;
  remittanceAed: number;
  status: Status;
  paidAt: string|null;
  note: string;
  entryId?: string;
};

function fmtMonth(m: string) { const [y,mo]=m.split("-"); return new Date(Number(y),Number(mo)-1,1).toLocaleDateString("en-AE",{month:"long",year:"numeric"}); }
function fmtDT(iso: string|null) { if(!iso) return "—"; return new Date(iso).toLocaleString("en-AE",{day:"2-digit",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"}); }

export default function RemittancePage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string|null>(null);
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMonth, setEditMonth] = useState<string|null>(null);
  const [editInr, setEditInr] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [toast, setToast] = useState("");

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      // Load all months from due_month_settings
      const [settingsRes, indiaItemsRes] = await Promise.all([
        supabase.from("due_month_settings").select("*").eq("user_id", user.id).order("month", { ascending: false }),
        supabase.from("due_items").select("id,group_name").eq("user_id", user.id).eq("group_name", "India"),
      ]);

      const indiaIds = (indiaItemsRes.data??[]).map((r:{id:string}) => r.id);

      // For each month settings, calculate India total
      const recs: MonthRecord[] = [];
      for (const s of settingsRes.data??[]) {
        const fxRate = (s.fx_rates as Record<string,number>)?.INR ?? 25.2;
        // Load India entries for that month
        const { data: entries } = await supabase.from("due_entries").select("*").eq("user_id", user.id).eq("month", s.month).in("due_item_id", indiaIds.length ? indiaIds : ["none"]);
        let totalInr = 0;
        for (const e of entries??[]) {
          const amt = e.amount ?? 0;
          const cur = (e.currency ?? "INR") as Currency;
          totalInr += cur === "INR" ? amt : (cur === "AED" ? amt * fxRate : amt * (fxRate / 3.67));
        }
        const remittanceAed = totalInr / fxRate;

        // Check if there's a remittance entry (stored as a special due_item with is_remittance=true)
        recs.push({ month:s.month, indiaTotalInr:totalInr, fxRate, remittanceAed, status:"pending", paidAt:null, note:s.note??"" });
      }

      setRecords(recs);
      setLoading(false);
    }
    load();
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(""),2500); }

  async function saveEdit(m: MonthRecord) {
    if (!userId) return;
    const inr = parseFloat(editInr) || m.indiaTotalInr;
    const rate = parseFloat(editRate) || m.fxRate;
    await supabase.from("due_month_settings").upsert({ user_id:userId, month:m.month, fx_rates:{ INR:rate, USD:3.67 } }, { onConflict:"user_id,month" });
    setRecords(p => p.map(r => r.month===m.month ? { ...r, indiaTotalInr:inr, fxRate:rate, remittanceAed:inr/rate, note:editNote||r.note } : r));
    setEditMonth(null);
    showToast("Saved");
  }

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#F5A623" };
  const btn = { padding:"7px 13px", borderRadius:9, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:12, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;

  if (loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  const totalSent = records.reduce((s,r) => s + r.remittanceAed, 0);

  return (
    <div style={{minHeight:"100vh",background:V.bg,color:V.text,fontFamily:"system-ui,sans-serif"}}>
      <div style={{position:"sticky",top:0,zIndex:20,background:isDark?"rgba(13,15,20,0.9)":"rgba(249,248,245,0.9)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${V.border}`,padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <Link href="/dashboard/budget" style={{display:"flex",alignItems:"center",gap:8,color:V.muted,textDecoration:"none",fontWeight:600,fontSize:13}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Due Tracker
        </Link>
        <span style={{fontSize:16,fontWeight:800}}>Remittance History</span>
        <div/>
      </div>
      <div style={{maxWidth:800,margin:"0 auto",padding:"24px 20px"}}>
        <div style={{marginBottom:20,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>Total remitted</div>
            <div style={{fontSize:18,fontWeight:800,color:V.accent}}>AED {totalSent.toFixed(0)}</div>
          </div>
          <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>Months tracked</div>
            <div style={{fontSize:18,fontWeight:800,color:V.muted}}>{records.length}</div>
          </div>
        </div>

        <div style={{background:V.card,border:`1px solid ${V.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"11px 16px",borderBottom:`1px solid ${V.border}`,display:"grid",gridTemplateColumns:"1fr 0.8fr 0.8fr 0.8fr",gap:8,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",color:V.faint,background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"}}>
            <div>Month</div><div>India Total (INR)</div><div>Rate</div><div>Remittance (AED)</div>
          </div>
          {records.length===0&&<div style={{padding:"24px",textAlign:"center",color:V.faint,fontSize:13}}>No records yet</div>}
          {records.map(r=>{
            const isEditing = editMonth===r.month;
            return (
              <div key={r.month} style={{borderBottom:`1px solid ${V.border}`}}>
                {isEditing ? (
                  <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{fontSize:14,fontWeight:700}}>{fmtMonth(r.month)}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12,fontWeight:700,color:V.faint,textTransform:"uppercase"}}>India Total (INR)<input type="number" style={inp} value={editInr} onChange={e=>setEditInr(e.target.value)} placeholder={r.indiaTotalInr.toFixed(0)} /></label>
                      <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12,fontWeight:700,color:V.faint,textTransform:"uppercase"}}>Rate (1 AED = ? INR)<input type="number" step="0.01" style={inp} value={editRate} onChange={e=>setEditRate(e.target.value)} placeholder={r.fxRate.toString()} /></label>
                    </div>
                    <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12,fontWeight:700,color:V.faint,textTransform:"uppercase"}}>Note<input style={inp} value={editNote} onChange={e=>setEditNote(e.target.value)} /></label>
                    {editInr&&editRate&&<div style={{fontSize:12,color:V.accent,fontWeight:700}}>= AED {(parseFloat(editInr)/parseFloat(editRate)).toFixed(0)}</div>}
                    <div style={{display:"flex",gap:8}}>
                      <button style={btnP} onClick={()=>saveEdit(r)}>Save</button>
                      <button style={btn} onClick={()=>setEditMonth(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 0.8fr 0.8fr 0.8fr",gap:8,alignItems:"center",cursor:"pointer"}}
                    onClick={()=>{setEditMonth(r.month);setEditInr(r.indiaTotalInr.toFixed(0));setEditRate(r.fxRate.toString());setEditNote(r.note);}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700}}>{fmtMonth(r.month)}</div>
                      {r.note&&<div style={{fontSize:11,color:V.faint,fontStyle:"italic"}}>{r.note}</div>}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:V.muted}}>₹{r.indiaTotalInr.toFixed(0)}</div>
                    <div style={{fontSize:12,color:V.faint}}>÷{r.fxRate}</div>
                    <div style={{fontSize:14,fontWeight:700,color:V.accent}}>AED {r.remittanceAed.toFixed(0)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {toast&&<div style={{position:"fixed",bottom:20,right:16,background:isDark?"#1a3a2a":"#f0fdf4",color:"#16a34a",border:"1px solid rgba(22,163,74,0.3)",padding:"12px 18px",borderRadius:12,fontSize:13,fontWeight:700,zIndex:200}}>{toast}</div>}
    </div>
  );
}
