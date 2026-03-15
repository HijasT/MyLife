"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type BiomarkerTest = {
  id:string; groupName:string; name:string; method:string;
  refRange:string; refMin:number|null; refMax:number|null; unit:string;
};
type BiomarkerResult = {
  id:string; testDate:string; valueNum:number|null; valueText:string; notes:string;
};
type BodyMetric = {
  id:string; measuredAt:string; weightKg:number|null; heightCm:number|null;
  bmi:number|null; bodyFatPct:number|null; visceralFatL:number|null; skeletalMuscleKg:number|null;
};

const BODY_FIELDS = [
  { key:"weightKg",       label:"Weight",          unit:"kg",  min:null as number|null,  max:null as number|null  },
  { key:"bmi",            label:"BMI",              unit:"",   min:18.5, max:24.9 },
  { key:"bodyFatPct",     label:"Body Fat",         unit:"%",  min:10,   max:20   },
  { key:"visceralFatL",   label:"Visceral Fat",     unit:"L",  min:0,    max:1.5  },
  { key:"skeletalMuscleKg",label:"Skeletal Muscle", unit:"kg", min:29,   max:50   },
  { key:"heightCm",       label:"Height",           unit:"cm", min:null, max:null },
];

function fmtDate(d:string) { return new Date(d).toLocaleDateString("en-AE",{day:"2-digit",month:"short",year:"numeric"}); }
function isOOR(v:number|null,min:number|null,max:number|null) { if(v===null)return false; if(min!==null&&v<min)return true; if(max!==null&&v>max)return true; return false; }

// Simple SVG sparkline chart with reference range shading
function SparkChart({ results, refMin, refMax, unit }: { results:{date:string;val:number}[]; refMin:number|null; refMax:number|null; unit:string }) {
  if (results.length < 2) return null;
  const vals = results.map(r=>r.val);
  const allVals = [...vals, refMin??vals[0], refMax??vals[0]].filter(x=>x!==null) as number[];
  const minV = Math.min(...allVals) * 0.95;
  const maxV = Math.max(...allVals) * 1.05;
  const W=500, H=140, PAD=40;
  const xScale = (i:number) => PAD + (i/(results.length-1))*(W-PAD*2);
  const yScale = (v:number) => H - PAD - ((v-minV)/(maxV-minV))*(H-PAD*2);

  const pts = results.map((r,i)=>({ x:xScale(i), y:yScale(r.val), val:r.val, date:r.date, oor:isOOR(r.val,refMin,refMax) }));
  const linePath = pts.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ");

  const refTop    = refMax !== null ? yScale(refMax) : PAD;
  const refBottom = refMin !== null ? yScale(refMin) : H-PAD;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto" }}>
      {/* Reference range shading */}
      <rect x={PAD} y={Math.min(refTop,refBottom)} width={W-PAD*2} height={Math.abs(refBottom-refTop)} fill="rgba(16,185,129,0.12)" />
      {/* Reference lines */}
      {refMax!==null&&<line x1={PAD} x2={W-PAD} y1={yScale(refMax)} y2={yScale(refMax)} stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" opacity="0.6"/>}
      {refMin!==null&&<line x1={PAD} x2={W-PAD} y1={yScale(refMin)} y2={yScale(refMin)} stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" opacity="0.6"/>}
      {/* Line */}
      <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Points */}
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill={p.oor?"#ef4444":"#6366f1"} />
          <text x={p.x} y={p.y-10} textAnchor="middle" fontSize="11" fill={p.oor?"#ef4444":"#9ca3af"}>{p.val}{unit}</text>
          <text x={p.x} y={H-8} textAnchor="middle" fontSize="9" fill="#6b7280">{new Date(p.date).toLocaleDateString("en-AE",{month:"short",year:"2-digit"})}</text>
        </g>
      ))}
      {/* Ref labels */}
      {refMax!==null&&<text x={W-PAD+4} y={yScale(refMax)+4} fontSize="10" fill="#10b981">{refMax}</text>}
      {refMin!==null&&<text x={W-PAD+4} y={yScale(refMin)+4} fontSize="10" fill="#10b981">{refMin}</text>}
    </svg>
  );
}

export default function BiomarkerDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const isBody = params.id === "body";
  const [test, setTest] = useState<BiomarkerTest|null>(null);
  const [results, setResults] = useState<BiomarkerResult[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTest, setEditTest] = useState(false);
  const [editFields, setEditFields] = useState({ method:"", refRange:"", refMin:"", refMax:"", unit:"" });
  const [toast, setToast] = useState("");
  const [userId, setUserId] = useState<string|null>(null);

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
      if (isBody) {
        const { data } = await supabase.from("body_metrics").select("*").eq("user_id",user.id).order("measured_at");
        setBodyMetrics((data??[]).map(r => ({ id:r.id, measuredAt:r.measured_at, weightKg:r.weight_kg??null, heightCm:r.height_cm??null, bmi:r.bmi??null, bodyFatPct:r.body_fat_pct??null, visceralFatL:r.visceral_fat_l??null, skeletalMuscleKg:r.skeletal_muscle_kg??null })));
      } else {
        const [tr, rr] = await Promise.all([
          supabase.from("biomarker_tests").select("*").eq("id",params.id).single(),
          supabase.from("biomarker_results").select("*").eq("test_id",params.id).order("test_date"),
        ]);
        if (tr.data) {
          const t = tr.data;
          setTest({ id:t.id, groupName:t.group_name, name:t.name, method:t.method??"", refRange:t.ref_range??"", refMin:t.ref_min??null, refMax:t.ref_max??null, unit:t.unit??"" });
          setEditFields({ method:t.method??"", refRange:t.ref_range??"", refMin:t.ref_min?.toString()??"", refMax:t.ref_max?.toString()??"", unit:t.unit??"" });
        }
        setResults((rr.data??[]).map(r => ({ id:r.id, testDate:r.test_date, valueNum:r.value_num??null, valueText:r.value_text??"", notes:r.notes??"" })));
      }
      setLoading(false);
    }
    load();
  }, [params.id]);

  async function saveTestEdit() {
    if (!test) return;
    const rMin = editFields.refMin ? parseFloat(editFields.refMin) : null;
    const rMax = editFields.refMax ? parseFloat(editFields.refMax) : null;
    await supabase.from("biomarker_tests").update({ method:editFields.method, ref_range:editFields.refRange, ref_min:rMin, ref_max:rMax, unit:editFields.unit }).eq("id",test.id);
    setTest(p => p ? {...p,...editFields,refMin:rMin,refMax:rMax} : p);
    setEditTest(false); showToast("Updated");
  }

  function showToast(msg:string){setToast(msg);setTimeout(()=>setToast(""),2500);}

  const chartData = useMemo(() => {
    return results.filter(r=>r.valueNum!==null).map(r=>({ date:r.testDate, val:r.valueNum! }));
  },[results]);

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#10b981" };
  const btn = { padding:"7px 13px", borderRadius:9, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:12, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;
  const section = { background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" as const, marginBottom:16 };
  const sHead = { padding:"11px 16px", borderBottom:`1px solid ${V.border}`, fontSize:11, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:V.faint, background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)" };

  if (loading) return <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",background:V.bg}}><div style={{width:28,height:28,border:`2.5px solid ${V.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  // ── BODY METRICS detail page ──
  if (isBody) {
    return (
      <div style={{minHeight:"100vh",background:V.bg,color:V.text,fontFamily:"system-ui,sans-serif"}}>
        <div style={{position:"sticky",top:0,zIndex:20,background:isDark?"rgba(13,15,20,0.9)":"rgba(249,248,245,0.9)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${V.border}`,padding:"12px 24px",display:"flex",alignItems:"center",gap:12}}>
          <Link href="/dashboard/biomarkers" style={{display:"flex",alignItems:"center",gap:8,color:V.muted,textDecoration:"none",fontWeight:600,fontSize:13}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            BioMarkers
          </Link>
          <span style={{fontSize:16,fontWeight:800}}>Body Metrics History</span>
        </div>
        <div style={{maxWidth:860,margin:"0 auto",padding:"24px 20px"}}>
          {BODY_FIELDS.map(field => {
            const pts = bodyMetrics
              .filter(m => (m as unknown as Record<string,unknown>)[field.key] !== null)
              .map(m => ({ date:m.measuredAt, val:(m as unknown as Record<string,number>)[field.key] }));
            if (!pts.length) return null;
            return (
              <div key={field.key} style={{...section,marginBottom:20}}>
                <div style={{...sHead,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>{field.label} {field.unit&&`(${field.unit})`}</span>
                  {field.min&&<span>Normal: {field.min}–{field.max} {field.unit}</span>}
                </div>
                <div style={{padding:"16px"}}>
                  <SparkChart results={pts} refMin={field.min} refMax={field.max} unit={field.unit} />
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:12}}>
                    {[...pts].reverse().map((p,i)=>( 
                      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)",borderRadius:8}}>
                        <span style={{fontSize:13,color:V.muted}}>{fmtDate(p.date)}</span>
                        <span style={{fontSize:14,fontWeight:700,color:isOOR(p.val,field.min,field.max)?"#ef4444":"#10b981"}}>{p.val} {field.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!test) return <div style={{padding:40,background:V.bg,minHeight:"100vh",color:V.muted}}>Not found. <Link href="/dashboard/biomarkers" style={{color:V.accent}}>Back</Link></div>;

  const latestResult = results[results.length-1];
  const latestVal = latestResult?.valueNum ?? null;
  const isOorLatest = isOOR(latestVal, test.refMin, test.refMax);

  return (
    <div style={{minHeight:"100vh",background:V.bg,color:V.text,fontFamily:"system-ui,sans-serif"}}>
      <div style={{position:"sticky",top:0,zIndex:20,background:isDark?"rgba(13,15,20,0.9)":"rgba(249,248,245,0.9)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${V.border}`,padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <Link href="/dashboard/biomarkers" style={{display:"flex",alignItems:"center",gap:8,color:V.muted,textDecoration:"none",fontWeight:600,fontSize:13}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          BioMarkers
        </Link>
        <button style={btn} onClick={()=>setEditTest(v=>!v)}>{editTest?"✓ Done":"Edit"}</button>
      </div>

      <div style={{maxWidth:800,margin:"0 auto",padding:"24px 20px"}}>
        {/* Header */}
        <div style={{marginBottom:20}}>
          <span style={{fontSize:11,fontWeight:700,color:V.accent,textTransform:"uppercase",letterSpacing:"0.1em"}}>{test.groupName}</span>
          <h1 style={{fontSize:24,fontWeight:800,margin:"4px 0 8px"}}>{test.name}</h1>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {test.method&&<span style={{fontSize:12,color:V.faint}}>Method: {test.method}</span>}
            <span style={{fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:999,background:"rgba(16,185,129,0.1)",color:V.accent}}>Ref: {test.refRange} {test.unit}</span>
          </div>
        </div>

        {/* Latest value */}
        {latestResult && (
          <div style={{background:V.card,border:`1px solid ${isOorLatest?"rgba(239,68,68,0.4)":"rgba(16,185,129,0.3)"}`,borderRadius:14,padding:"16px 20px",marginBottom:20,display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:V.faint,textTransform:"uppercase",marginBottom:4}}>Latest ({fmtDate(latestResult.testDate)})</div>
              <div style={{fontSize:32,fontWeight:800,color:isOorLatest?"#ef4444":"#10b981"}}>{latestVal ?? latestResult.valueText}<span style={{fontSize:14,fontWeight:500,marginLeft:4}}>{test.unit}</span></div>
              {isOorLatest&&<div style={{fontSize:12,color:"#ef4444",fontWeight:600,marginTop:2}}>⚠ Outside reference range ({test.refRange})</div>}
            </div>
          </div>
        )}

        {/* Edit panel */}
        {editTest && (
          <div style={{...section,marginBottom:20}}>
            <div style={sHead}>Edit test details</div>
            <div style={{padding:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:12,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.06em",gridColumn:"1/-1"}}>
                Method <input style={inp} value={editFields.method} onChange={e=>setEditFields(p=>({...p,method:e.target.value}))} />
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:12,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                Ref Min <input style={inp} type="number" step="0.01" value={editFields.refMin} onChange={e=>setEditFields(p=>({...p,refMin:e.target.value}))} />
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:12,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                Ref Max <input style={inp} type="number" step="0.01" value={editFields.refMax} onChange={e=>setEditFields(p=>({...p,refMax:e.target.value}))} />
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:5,fontSize:12,fontWeight:700,color:V.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                Unit <input style={inp} value={editFields.unit} onChange={e=>setEditFields(p=>({...p,unit:e.target.value}))} />
              </label>
            </div>
            <div style={{padding:"0 16px 16px",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button style={btn} onClick={()=>setEditTest(false)}>Cancel</button>
              <button style={btnP} onClick={saveTestEdit}>Save</button>
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length >= 2 && (
          <div style={section}>
            <div style={sHead}>Trend ({results.length} results)</div>
            <div style={{padding:"16px 20px"}}>
              <SparkChart results={chartData} refMin={test.refMin} refMax={test.refMax} unit={test.unit} />
            </div>
          </div>
        )}

        {/* Results table */}
        <div style={section}>
          <div style={sHead}>All results</div>
          {results.length===0&&<div style={{padding:"20px 16px",textAlign:"center",color:V.faint,fontSize:13}}>No results yet</div>}
          {[...results].reverse().map(r=>{
            const v=r.valueNum??r.valueText;
            const oor=isOOR(r.valueNum,test.refMin,test.refMax);
            return (
              <div key={r.id} style={{padding:"11px 16px",borderBottom:`1px solid ${V.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                <div style={{fontSize:14,fontWeight:600,color:V.muted}}>{fmtDate(r.testDate)}</div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:16,fontWeight:800,color:oor?"#ef4444":"#10b981"}}>{v} <span style={{fontSize:12,fontWeight:500,color:V.faint}}>{test.unit}</span></span>
                  {oor&&<span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>⚠ Out of range</span>}
                </div>
                {r.notes&&<div style={{fontSize:11,color:V.faint,fontStyle:"italic"}}>{r.notes}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {toast&&<div style={{position:"fixed",bottom:20,right:16,background:isDark?"#0d2b1e":"#f0fdf4",color:"#10b981",border:"1px solid rgba(16,185,129,0.3)",padding:"12px 18px",borderRadius:12,fontSize:13,fontWeight:700,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",zIndex:200}}>{toast}</div>}
    </div>
  );
}
