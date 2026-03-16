"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { nowDubai, todayDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";

type BiomarkerTest = {
  id: string; groupName: string; name: string; method: string;
  refRange: string; refMin: number|null; refMax: number|null;
  unit: string; sortOrder: number;
};
type BiomarkerResult = {
  id: string; testId: string; testDate: string;
  valueNum: number|null; valueText: string; notes: string;
};
type BodyMetric = {
  id: string; measuredAt: string; weightKg: number|null; heightCm: number|null;
  bmi: number|null; bodyFatPct: number|null; visceralFatL: number|null;
  skeletalMuscleKg: number|null; notes: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToTest = (r: any): BiomarkerTest => ({ id:r.id, groupName:r.group_name, name:r.name, method:r.method??"", refRange:r.ref_range??"", refMin:r.ref_min??null, refMax:r.ref_max??null, unit:r.unit??"", sortOrder:r.sort_order??0 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToResult = (r: any): BiomarkerResult => ({ id:r.id, testId:r.test_id, testDate:r.test_date, valueNum:r.value_num??null, valueText:r.value_text??"", notes:r.notes??"" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToMetric = (r: any): BodyMetric => ({ id:r.id, measuredAt:r.measured_at, weightKg:r.weight_kg??null, heightCm:r.height_cm??null, bmi:r.bmi??null, bodyFatPct:r.body_fat_pct??null, visceralFatL:r.visceral_fat_l??null, skeletalMuscleKg:r.skeletal_muscle_kg??null, notes:r.notes??"" });

function isOutOfRange(val: number|null, min: number|null, max: number|null): boolean {
  if (val === null) return false;
  if (min !== null && val < min) return true;
  if (max !== null && val > max) return true;
  return false;
}

function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-AE", { day:"2-digit", month:"short", year:"numeric" }); }

// BMI standards
const BODY_STANDARDS = {
  bmi: { min:18.5, max:24.9, label:"BMI" },
  bodyFatPct: { min:10, max:20, label:"Body Fat %" },  // male
  visceralFatL: { min:0, max:1.5, label:"Visceral Fat (L)" },
  skeletalMuscleKg: { min:29, max:50, label:"Skeletal Muscle" },
};

export default function BioMarkersPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<BiomarkerTest[]>([]);
  const [results, setResults] = useState<BiomarkerResult[]>([]);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showAddResult, setShowAddResult] = useState(false);
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [addDate, setAddDate] = useState(nowDubai().slice(0,10));
  const [addValues, setAddValues] = useState<Record<string, string>>({});
  const [metricForm, setMetricForm] = useState({ measuredAt:nowDubai().slice(0,10), weightKg:"", heightCm:"", bmi:"", bodyFatPct:"", visceralFatL:"", skeletalMuscleKg:"", notes:"" });
  const [toast, setToast] = useState("");

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const [testsRes, resultsRes, metricsRes] = await Promise.all([
        supabase.from("biomarker_tests").select("*").eq("user_id", user.id).order("sort_order"),
        supabase.from("biomarker_results").select("*").eq("user_id", user.id).order("test_date", { ascending: false }),
        supabase.from("body_metrics").select("*").eq("user_id", user.id).order("measured_at", { ascending: false }),
      ]);
      setTests((testsRes.data??[]).map(dbToTest));
      setResults((resultsRes.data??[]).map(dbToResult));
      setMetrics((metricsRes.data??[]).map(dbToMetric));
      setLoading(false);
    }
    load();
  }, []);

  // Latest results per test
  const latestResults = useMemo(() => {
    const map = new Map<string, BiomarkerResult>();
    // results are sorted desc by date, so first occurrence = latest
    for (const r of results) {
      if (!map.has(r.testId)) map.set(r.testId, r);
    }
    return map;
  }, [results]);

  const latestDate = useMemo(() => {
    if (!results.length) return null;
    return results[0].testDate;
  }, [results]);

  // Groups
  const groups = useMemo(() => {
    const map = new Map<string, BiomarkerTest[]>();
    for (const t of tests) {
      if (!map.has(t.groupName)) map.set(t.groupName, []);
      map.get(t.groupName)!.push(t);
    }
    return map;
  }, [tests]);

  function toggleGroup(g: string) {
    setCollapsedGroups(p => { const n = new Set(p); n.has(g)?n.delete(g):n.add(g); return n; });
  }

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(""), 2500); }

  async function saveResults() {
    if (!userId) return;
    const inserts = Object.entries(addValues)
      .filter(([,v]) => v.trim() !== "")
      .map(([testId, v]) => {
        const num = parseFloat(v);
        return { user_id:userId, test_id:testId, test_date:addDate, value_num:isNaN(num)?null:num, value_text:v };
      });
    if (!inserts.length) return;
    const { data } = await supabase.from("biomarker_results").upsert(inserts, { onConflict:"test_id,test_date" }).select("*");
    if (data) {
      const newResults = data.map(dbToResult);
      setResults(p => {
        const existing = p.filter(r => !(newResults.some(n => n.testId === r.testId && n.testDate === r.testDate)));
        return [...newResults, ...existing].sort((a,b) => b.testDate.localeCompare(a.testDate));
      });
      setShowAddResult(false); setAddValues({});
      showToast(`Saved ${inserts.length} results`);
    }
  }

  async function saveMetric() {
    if (!userId) return;
    const w = parseFloat(metricForm.weightKg)||null;
    const h = parseFloat(metricForm.heightCm)||null;
    const bmi = w && h ? parseFloat((w/((h/100)**2)).toFixed(1)) : parseFloat(metricForm.bmi)||null;
    const { data } = await supabase.from("body_metrics").upsert({
      user_id:userId, measured_at:metricForm.measuredAt,
      weight_kg:w, height_cm:h, bmi,
      body_fat_pct:parseFloat(metricForm.bodyFatPct)||null,
      visceral_fat_l:parseFloat(metricForm.visceralFatL)||null,
      skeletal_muscle_kg:parseFloat(metricForm.skeletalMuscleKg)||null,
      notes:metricForm.notes,
    }, { onConflict:"user_id,measured_at" }).select("*").single();
    if (data) {
      setMetrics(p => { const e=p.filter(m=>m.measuredAt!==data.measured_at); return [dbToMetric(data),...e]; });
      setShowAddMetric(false);
      showToast("Metrics saved");
    }
  }

  async function copyToClipboard() {
    if (!latestDate) return;
    const lines: string[] = [`📋 Lab Results — ${fmtDate(latestDate)}`, ""];
    for (const [group, groupTests] of groups.entries()) {
      lines.push(`【${group}】`);
      for (const t of groupTests) {
        const r = latestResults.get(t.id);
        if (!r) continue;
        const v = r.valueNum ?? r.valueText;
        const flag = isOutOfRange(r.valueNum, t.refMin, t.refMax) ? " ⚠️" : "";
        lines.push(`${t.name}: ${v} ${t.unit}${flag} (${t.refRange})`);
      }
      lines.push("");
    }
    const latest = metrics[0];
    if (latest) {
      lines.push("【Body Metrics】");
      if (latest.weightKg) lines.push(`Weight: ${latest.weightKg} kg`);
      if (latest.bmi) lines.push(`BMI: ${latest.bmi}`);
      if (latest.bodyFatPct) lines.push(`Body Fat: ${latest.bodyFatPct}%`);
      if (latest.visceralFatL) lines.push(`Visceral Fat: ${latest.visceralFatL}L`);
      if (latest.skeletalMuscleKg) lines.push(`Skeletal Muscle: ${latest.skeletalMuscleKg}kg`);
    }
    try { await navigator.clipboard.writeText(lines.join("\n")); showToast("Copied to clipboard ✓"); }
    catch { showToast("Copy failed"); }
  }

  const V = { bg:isDark?"#0d0f14":"#f9f8f5", card:isDark?"#16191f":"#ffffff", border:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", text:isDark?"#f0ede8":"#1a1a1a", muted:isDark?"#9ba3b2":"#6b7280", faint:isDark?"#5c6375":"#9ca3af", input:isDark?"#1e2130":"#f9fafb", accent:"#10b981" };
  const btn = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp = { padding:"8px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none" } as const;
  const lbl = { display:"flex" as const, flexDirection:"column" as const, gap:4, fontSize:11, fontWeight:700, color:V.faint, textTransform:"uppercase" as const, letterSpacing:"0.07em" };

  const latestMetric = metrics[0];

  if (loading) return <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background:V.bg }}><div style={{ width:28, height:28, border:`2.5px solid ${V.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Bio<span style={{ color:V.accent, fontStyle:"italic" }}>Markers</span></div>
          <div style={{ fontSize:13, color:V.faint, marginTop:2 }}>Lab results · Body metrics</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button style={btn} onClick={copyToClipboard}>📋 Copy all</button>
          <button style={btn} onClick={() => setShowAddMetric(true)}>+ Body metrics</button>
          <button style={btnP} onClick={() => setShowAddResult(true)}>+ Add results</button>
        </div>
      </div>

      {latestDate && <div style={{ margin:"8px 24px 0", fontSize:12, color:V.faint }}>Latest: {fmtDate(latestDate)}</div>}

      {/* ── Body Metrics Section ── */}
      <div style={{ padding:"14px 24px 0" }}>
        <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden", marginBottom:16 }}>
          <div onClick={() => toggleGroup("__body__")} style={{ padding:"11px 16px", borderBottom:collapsedGroups.has("__body__")?undefined:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)", userSelect:"none" }}>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <span style={{ fontSize:12, color:V.faint, transition:"transform 0.2s", display:"inline-block", transform:collapsedGroups.has("__body__")?"rotate(-90deg)":"rotate(0deg)" }}>▾</span>
              <span style={{ fontSize:14, fontWeight:800 }}>⚖️ Body Metrics</span>
              {latestMetric && <span style={{ fontSize:11, color:V.faint }}>{fmtDate(latestMetric.measuredAt)}</span>}
            </div>
            <button style={{ ...btnP, padding:"3px 10px", fontSize:11 }} onClick={e=>{e.stopPropagation();setShowAddMetric(true);}}>+ Update</button>
          </div>
          {!collapsedGroups.has("__body__") && latestMetric && (
            <div style={{ padding:"14px 16px", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:10 }}>
              {[
                { key:"weightKg",       label:"Weight",         val:latestMetric.weightKg,       unit:"kg",  std:null },
                { key:"bmi",            label:"BMI",            val:latestMetric.bmi,            unit:"",    std:BODY_STANDARDS.bmi },
                { key:"bodyFatPct",     label:"Body Fat",       val:latestMetric.bodyFatPct,     unit:"%",   std:BODY_STANDARDS.bodyFatPct },
                { key:"visceralFatL",   label:"Visceral Fat",   val:latestMetric.visceralFatL,   unit:"L",   std:BODY_STANDARDS.visceralFatL },
                { key:"skeletalMuscleKg",label:"Skeletal Muscle",val:latestMetric.skeletalMuscleKg,unit:"kg",std:BODY_STANDARDS.skeletalMuscleKg },
                { key:"heightCm",       label:"Height",         val:latestMetric.heightCm,       unit:"cm",  std:null },
              ].map(item => {
                if (item.val === null || item.val === undefined) return null;
                const oor = item.std && (item.val < item.std.min || item.val > item.std.max);
                return (
                  <div key={item.key} onClick={() => router.push(`/dashboard/biomarkers/body`)}
                    style={{ background:oor?isDark?"rgba(239,68,68,0.1)":"rgba(239,68,68,0.05)":isDark?"rgba(16,185,129,0.08)":"rgba(16,185,129,0.05)", border:`1px solid ${oor?"rgba(239,68,68,0.3)":"rgba(16,185,129,0.2)"}`, borderRadius:10, padding:"10px 12px", cursor:"pointer" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:V.faint, textTransform:"uppercase", marginBottom:4 }}>{item.label}</div>
                    <div style={{ fontSize:17, fontWeight:800, color:oor?"#ef4444":"#10b981" }}>{item.val}<span style={{ fontSize:11, fontWeight:500, marginLeft:2 }}>{item.unit}</span></div>
                    {item.std && <div style={{ fontSize:10, color:V.faint }}>Normal: {item.std.min}–{item.std.max}</div>}
                  </div>
                );
              })}
            </div>
          )}
          {!collapsedGroups.has("__body__") && !latestMetric && (
            <div style={{ padding:"20px 16px", textAlign:"center", color:V.faint, fontSize:13 }}>No body metrics recorded · Click + Update to add</div>
          )}
        </div>

        {/* ── Biomarker groups ── */}
        {Array.from(groups.entries()).map(([group, groupTests]) => {
          const isCollapsed = collapsedGroups.has(group);
          const outOfRangeCount = groupTests.filter(t => {
            const r = latestResults.get(t.id);
            return r && isOutOfRange(r.valueNum, t.refMin, t.refMax);
          }).length;

          return (
            <div key={group} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden", marginBottom:12 }}>
              <div onClick={() => toggleGroup(group)} style={{ padding:"11px 16px", borderBottom:isCollapsed?undefined:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)", userSelect:"none" }}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <span style={{ fontSize:12, color:V.faint, transition:"transform 0.2s", display:"inline-block", transform:isCollapsed?"rotate(-90deg)":"rotate(0deg)" }}>▾</span>
                  <span style={{ fontSize:14, fontWeight:800 }}>{group}</span>
                  <span style={{ fontSize:11, color:V.faint }}>{groupTests.length} tests</span>
                  {outOfRangeCount > 0 && <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"rgba(239,68,68,0.12)", color:"#ef4444" }}>⚠ {outOfRangeCount} flagged</span>}
                </div>
              </div>

              {!isCollapsed && (
                <div>
                  {/* Column headers */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 0.7fr 0.7fr 0.8fr", gap:8, padding:"8px 16px", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.08em", color:V.faint, borderBottom:`1px solid ${V.border}`, background:isDark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)" }}>
                    <div>Test</div><div>Value</div><div>Reference</div><div>Unit</div>
                  </div>
                  {groupTests.map(t => {
                    const r = latestResults.get(t.id);
                    const v = r ? (r.valueNum ?? r.valueText) : null;
                    const oor = r ? isOutOfRange(r.valueNum, t.refMin, t.refMax) : false;
                    return (
                      <div key={t.id} onClick={() => router.push(`/dashboard/biomarkers/${t.id}`)}
                        style={{ display:"grid", gridTemplateColumns:"1fr 0.7fr 0.7fr 0.8fr", gap:8, padding:"10px 16px", borderBottom:`1px solid ${V.border}`, cursor:"pointer", alignItems:"center", transition:"background 0.1s" }}
                        onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background=isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"}
                        onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background=""}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{t.name}</div>
                        <div style={{ fontSize:14, fontWeight:700, color:oor?"#ef4444":"#10b981" }}>
                          {v !== null ? String(v) : <span style={{ color:V.faint }}>—</span>}
                        </div>
                        <div style={{ fontSize:12, color:V.muted }}>{t.refRange || "—"}</div>
                        <div style={{ fontSize:12, color:V.faint }}>{t.unit}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {tests.length === 0 && (
          <div style={{ padding:"60px 0", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🧬</div>
            <div style={{ fontSize:16, fontWeight:600, color:V.muted }}>No biomarkers yet</div>
            <div style={{ fontSize:13, color:V.faint, marginTop:6 }}>Run the biomarkers-migration.sql in Supabase to seed your data</div>
          </div>
        )}
      </div>

      {/* ── Add Results Modal ── */}
      {showAddResult && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowAddResult(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(680px,100%)", maxHeight:"92vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"16px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:V.card, zIndex:1 }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Add lab results</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="date" style={inp} value={addDate} onChange={e=>setAddDate(e.target.value)} />
                <button style={btn} onClick={()=>setShowAddResult(false)}>✕</button>
              </div>
            </div>
            <div style={{ padding:20 }}>
              {Array.from(groups.entries()).map(([group, groupTests]) => (
                <div key={group} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.1em", color:V.accent, marginBottom:10 }}>{group}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
                    {groupTests.map(t => (
                      <label key={t.id} style={lbl}>
                        <span>{t.name} {t.unit&&<span style={{ color:V.faint, fontWeight:400, textTransform:"none" }}>({t.unit})</span>}</span>
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          <input style={{ ...inp, flex:1 }} placeholder={t.refRange||"value"}
                            value={addValues[t.id]??""} onChange={e=>setAddValues(p=>({...p,[t.id]:e.target.value}))} />
                          {t.refMin!==null&&t.refMax!==null&&addValues[t.id]&&(
                            <span style={{ fontSize:10, color:isOutOfRange(parseFloat(addValues[t.id]),t.refMin,t.refMax)?"#ef4444":"#10b981", fontWeight:700 }}>
                              {isOutOfRange(parseFloat(addValues[t.id]),t.refMin,t.refMax)?"⚠":"✓"}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize:9, color:V.faint }}>{t.refRange&&`Ref: ${t.refRange}`}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8, position:"sticky", bottom:0, background:V.card, borderTop:`1px solid ${V.border}`, paddingTop:14 }}>
              <button style={btn} onClick={()=>setShowAddResult(false)}>Cancel</button>
              <button style={btnP} onClick={saveResults}>Save {Object.values(addValues).filter(v=>v.trim()).length} results</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Body Metrics Modal ── */}
      {showAddMetric && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowAddMetric(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(500px,100%)", maxHeight:"90vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"16px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:18, fontWeight:800 }}>Body metrics</div>
              <button style={btn} onClick={()=>setShowAddMetric(false)}>✕</button>
            </div>
            <div style={{ padding:20, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <label style={{ ...lbl, gridColumn:"1/-1" }}>Date <input type="date" style={inp} value={metricForm.measuredAt} onChange={e=>setMetricForm(p=>({...p,measuredAt:e.target.value}))} /></label>
              <label style={lbl}>Weight (kg) <input style={inp} type="number" step="0.1" value={metricForm.weightKg} onChange={e=>setMetricForm(p=>({...p,weightKg:e.target.value}))} /></label>
              <label style={lbl}>Height (cm) <input style={inp} type="number" value={metricForm.heightCm} onChange={e=>setMetricForm(p=>({...p,heightCm:e.target.value}))} /></label>
              <label style={lbl}>Body Fat % <input style={inp} type="number" step="0.1" value={metricForm.bodyFatPct} onChange={e=>setMetricForm(p=>({...p,bodyFatPct:e.target.value}))} /></label>
              <label style={lbl}>Visceral Fat (L) <input style={inp} type="number" step="0.01" value={metricForm.visceralFatL} onChange={e=>setMetricForm(p=>({...p,visceralFatL:e.target.value}))} /></label>
              <label style={lbl}>Skeletal Muscle (kg) <input style={inp} type="number" step="0.1" value={metricForm.skeletalMuscleKg} onChange={e=>setMetricForm(p=>({...p,skeletalMuscleKg:e.target.value}))} /></label>
              <label style={{ ...lbl, gridColumn:"1/-1" }}>Notes <input style={inp} value={metricForm.notes} onChange={e=>setMetricForm(p=>({...p,notes:e.target.value}))} /></label>
            </div>
            <div style={{ padding:"0 20px 20px", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button style={btn} onClick={()=>setShowAddMetric(false)}>Cancel</button>
              <button style={btnP} onClick={saveMetric}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom:20, right:16, background:isDark?"#0d2b1e":"#f0fdf4", color:"#10b981", border:"1px solid rgba(16,185,129,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", zIndex:200 }}>{toast}</div>}
    </div>
  );
}
