"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BiomarkerTest = {
  id: string;
  groupName: string;
  name: string;
  method: string;
  refRange: string;
  refMin: number | null;
  refMax: number | null;
  unit: string;
  sortOrder: number;
};

type BiomarkerResult = {
  id: string;
  testId: string;
  testDate: string;
  valueNum: number | null;
  valueText: string;
  notes: string;
};

type MarkerStatus = "low" | "normal" | "high" | "no-range" | "text" | "missing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToTest = (r: any): BiomarkerTest => ({ id: r.id, groupName: r.group_name, name: r.name, method: r.method ?? "", refRange: r.ref_range ?? "", refMin: r.ref_min ?? null, refMax: r.ref_max ?? null, unit: r.unit ?? "", sortOrder: r.sort_order ?? 0 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToResult = (r: any): BiomarkerResult => ({ id: r.id, testId: r.test_id, testDate: r.test_date, valueNum: r.value_num ?? null, valueText: r.value_text ?? "", notes: r.notes ?? "" });

function fmtDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-AE", { day: "2-digit", month: "short" });
}

function rangeLabel(test: BiomarkerTest) {
  if (test.refMin == null && test.refMax == null) return "Not configured";
  if (test.refMin != null && test.refMax != null) return `${test.refMin} – ${test.refMax}${test.unit ? ` ${test.unit}` : ""}`;
  if (test.refMin != null) return `≥ ${test.refMin}${test.unit ? ` ${test.unit}` : ""}`;
  return `≤ ${test.refMax}${test.unit ? ` ${test.unit}` : ""}`;
}
function deltaColorForTest(delta: number | null, current: number | null, test: BiomarkerTest) {
  if (delta == null || current == null) return "#6b7280";
  const within = (test.refMin == null || current >= test.refMin) && (test.refMax == null || current <= test.refMax);
  return within ? "#059669" : "#dc2626";
}

function markerStatus(result: BiomarkerResult | undefined, test: BiomarkerTest): MarkerStatus {
  if (!result) return "missing";
  if (result.valueNum == null) return result.valueText ? "text" : "missing";
  if (test.refMin == null && test.refMax == null) return "no-range";
  if (test.refMin != null && result.valueNum < test.refMin) return "low";
  if (test.refMax != null && result.valueNum > test.refMax) return "high";
  return "normal";
}
function statusTone(status: MarkerStatus) {
  switch (status) {
    case "low": return { bg: "rgba(59,130,246,0.12)", fg: "#2563eb", label: "Low" };
    case "high": return { bg: "rgba(239,68,68,0.12)", fg: "#dc2626", label: "High" };
    case "normal": return { bg: "rgba(16,185,129,0.12)", fg: "#059669", label: "Normal" };
    case "no-range": return { bg: "rgba(245,158,11,0.12)", fg: "#d97706", label: "No range" };
    case "text": return { bg: "rgba(99,102,241,0.12)", fg: "#4f46e5", label: "Text" };
    default: return { bg: "rgba(107,114,128,0.12)", fg: "#6b7280", label: "Missing" };
  }
}
function deltaPct(prev: number | null, curr: number | null) {
  if (prev == null || curr == null) return { delta: null, pct: null };
  const delta = Number((curr - prev).toFixed(2));
  if (prev === 0) return { delta, pct: null };
  return { delta, pct: Number((((curr - prev) / prev) * 100).toFixed(1)) };
}
function compareTone(value: number | null) {
  if (value == null || value === 0) return "#6b7280";
  return value > 0 ? "#dc2626" : "#059669";
}

function TrendChart({ points, refMin, refMax }: { points: { x: string; y: number }[]; refMin: number | null; refMax: number | null }) {
  const W = 720;
  const H = 240;
  if (!points.length) return <div style={{ fontSize: 13, color: "#6b7280" }}>No numeric results to chart yet.</div>;
  const values = points.map((p) => p.y);
  const minV = Math.min(...values, ...(refMin != null ? [refMin] : []), ...(refMax != null ? [refMax] : []));
  const maxV = Math.max(...values, ...(refMin != null ? [refMin] : []), ...(refMax != null ? [refMax] : []));
  const span = Math.max(maxV - minV, 1);
  const padX = 34;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const pts = points.map((p, i) => ({ x: padX + (i / Math.max(points.length - 1, 1)) * innerW, y: padY + innerH - ((p.y - minV) / span) * innerH, label: p.x, value: p.y }));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const avgY = padY + innerH - ((avg - minV) / span) * innerH;
  const bandY1 = refMax == null ? null : padY + innerH - ((refMax - minV) / span) * innerH;
  const bandY2 = refMin == null ? null : padY + innerH - ((refMin - minV) / span) * innerH;
  const bandTop = bandY1 != null && bandY2 != null ? Math.min(bandY1, bandY2) : null;
  const bandHeight = bandY1 != null && bandY2 != null ? Math.abs(bandY1 - bandY2) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 260 }}>
      {bandTop != null && bandHeight != null && <rect x={padX} y={bandTop} width={innerW} height={bandHeight} fill="rgba(16,185,129,0.08)" />}
      <line x1={padX} x2={W - padX} y1={avgY} y2={avgY} stroke="#f59e0b" strokeDasharray="7 5" strokeWidth="2" />
      <polyline fill="none" stroke="#10b981" strokeWidth="3" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
      {pts.map((p) => (
        <g key={`${p.label}-${p.value}`}>
          <circle cx={p.x} cy={p.y} r="4" fill="#10b981" />
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize="10" fill="#6b7280">{fmtShort(p.label)}</text>
        </g>
      ))}
      <text x={W - padX} y={avgY - 6} textAnchor="end" fontSize="11" fill="#d97706">Avg {avg.toFixed(2)}</text>
    </svg>
  );
}

export default function BiomarkerDetailPage({ params }: { params: { id: string } }) {
  const client = createClient();
  const router = useRouter();
  const [test, setTest] = useState<BiomarkerTest | null>(null);
  const [results, setResults] = useState<BiomarkerResult[]>([]);
  const [allTests, setAllTests] = useState<BiomarkerTest[]>([]);
  const [allResults, setAllResults] = useState<BiomarkerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState("");
  const [compareTestId, setCompareTestId] = useState("");
  const [editFields, setEditFields] = useState({ method: "", refMin: "", refMax: "", unit: "", groupName: "", newGroupName: "" });
  const [historyEditMode, setHistoryEditMode] = useState(false);
  const [editingResults, setEditingResults] = useState<Record<string, { valueNum: string; valueText: string; notes: string }>>({});
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const V = { bg: isDark ? "#0d0f14" : "#f9f8f5", card: isDark ? "#16191f" : "#ffffff", border: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", text: isDark ? "#f0ede8" : "#1a1a1a", muted: isDark ? "#9ba3b2" : "#6b7280", faint: isDark ? "#6b7280" : "#9ca3af", input: isDark ? "#1e2130" : "#f7f7f8", accent: "#10b981" };
  const btn = { padding: "10px 16px", minWidth: 92, height: 44, borderRadius: 14, border: `1px solid ${V.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "#fff", color: V.text, cursor: "pointer", fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: isDark ? "0 10px 24px rgba(0,0,0,0.18)" : "0 10px 24px rgba(15,23,42,0.06)" } as const;
  const btnP = { ...btn, minWidth: 160, background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)", color: "#fff", border: "none" } as const;
  const input = { padding: "9px 12px", borderRadius: 10, border: `1px solid ${V.border}`, background: V.input, color: V.text, fontSize: 13, outline: "none" } as const;
  const section = { background: V.card, border: `1px solid ${V.border}`, borderRadius: 16 } as const;

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const [tRes, rRes, allTRes, allRRes] = await Promise.all([
        client.from("biomarker_tests").select("*").eq("id", params.id).single(),
        client.from("biomarker_results").select("*").eq("test_id", params.id).eq("user_id", user.id).order("test_date", { ascending: true }),
        client.from("biomarker_tests").select("*").eq("user_id", user.id).order("name"),
        client.from("biomarker_results").select("*").eq("user_id", user.id).order("test_date", { ascending: true }),
      ]);
      if (tRes.data) {
        const mapped = dbToTest(tRes.data);
        setTest(mapped);
        setEditFields({ method: mapped.method, refMin: mapped.refMin?.toString() ?? "", refMax: mapped.refMax?.toString() ?? "", unit: mapped.unit, groupName: mapped.groupName, newGroupName: "" });
      }
      setResults((rRes.data ?? []).map(dbToResult));
      setAllTests((allTRes.data ?? []).map(dbToTest));
      setAllResults((allRRes.data ?? []).map(dbToResult));
      setLoading(false);
    }
    load();
  }, [client, params.id]);

  const latest = results.at(-1);
  const previous = results.length > 1 ? results[results.length - 2] : undefined;
  const status = test ? markerStatus(latest, test) : "missing";
  const tone = statusTone(status);
  const d = deltaPct(previous?.valueNum ?? null, latest?.valueNum ?? null);
  const numericPoints = results.filter((r) => r.valueNum != null).map((r) => ({ x: r.testDate, y: r.valueNum as number }));
  const mixedMode = results.some((r) => r.valueNum == null && r.valueText);
  const overdueDays = latest ? Math.floor((Date.now() - new Date(`${latest.testDate}T00:00:00`).getTime()) / 86400000) : null;

  const compareSeries = useMemo(() => {
    if (!compareTestId || !test) return { rows: [] as { date: string; a: number; b: number }[], r: null as number | null };
    const left = new Map(results.filter((x) => x.valueNum != null).map((x) => [x.testDate, x.valueNum as number]));
    const right = allResults.filter((x) => x.testId === compareTestId && x.valueNum != null && left.has(x.testDate)).map((x) => ({ date: x.testDate, a: left.get(x.testDate) as number, b: x.valueNum as number }));
    if (right.length < 2) return { rows: right, r: null };
    const avgA = right.reduce((s, p) => s + p.a, 0) / right.length;
    const avgB = right.reduce((s, p) => s + p.b, 0) / right.length;
    const num = right.reduce((s, p) => s + (p.a - avgA) * (p.b - avgB), 0);
    const denA = Math.sqrt(right.reduce((s, p) => s + (p.a - avgA) ** 2, 0));
    const denB = Math.sqrt(right.reduce((s, p) => s + (p.b - avgB) ** 2, 0));
    return { rows: right, r: denA && denB ? Number((num / (denA * denB)).toFixed(2)) : null };
  }, [compareTestId, results, allResults, test]);

  const existingGroups = useMemo(() => Array.from(new Set(allTests.map((x) => x.groupName).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [allTests]);
  const orderedTests = useMemo(() => [...allTests].sort((a, b) => a.groupName.localeCompare(b.groupName) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [allTests]);
  const currentIndex = orderedTests.findIndex((x) => x.id === test?.id);
  const prevTest = currentIndex > 0 ? orderedTests[currentIndex - 1] : null;
  const nextTest = currentIndex >= 0 && currentIndex < orderedTests.length - 1 ? orderedTests[currentIndex + 1] : null;

  async function saveEdit() {
    if (!test) return;
    const payload = {
      method: editFields.method || null,
      ref_min: editFields.refMin === "" ? null : Number(editFields.refMin),
      ref_max: editFields.refMax === "" ? null : Number(editFields.refMax),
      ref_range: null,
      unit: editFields.unit || null,
      group_name: (editFields.groupName === "__new__" ? editFields.newGroupName : editFields.groupName) || test.groupName,
    };
    const { data, error } = await client.from("biomarker_tests").update(payload).eq("id", test.id).select("*").single();
    if (error) {
      showToast(error.message);
      return;
    }
    if (data) {
      const mapped = dbToTest(data);
      setTest(mapped);
      setEditMode(false);
      showToast("Definition updated");
    }
  }

  async function saveAllHistoryEdits() {
    const entries = Object.entries(editingResults);
    if (!entries.length) { setHistoryEditMode(false); return; }
    for (const [id, vals] of entries) {
      const payload = {
        value_num: vals.valueNum === "" ? null : Number(vals.valueNum),
        value_text: vals.valueText || null,
        notes: vals.notes || null,
      };
      const { data, error } = await client.from("biomarker_results").update(payload).eq("id", id).select("*").single();
      if (error) { showToast(error.message); return; }
      if (data) {
        const mapped = dbToResult(data);
        setResults((prev) => prev.map((r) => r.id === mapped.id ? mapped : r).sort((a, b) => a.testDate.localeCompare(b.testDate)));
      }
    }
    setHistoryEditMode(false);
    setEditingResults({});
    showToast("History updated");
  }

  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: V.bg, color: V.muted }}>Loading marker…</div>;
  if (!test) return <div style={{ minHeight: "100vh", background: V.bg, color: V.muted, padding: 24 }}>Marker not found. <Link href="/dashboard/biomarkers">Back</Link></div>;

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "14px 24px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link href="/dashboard/biomarkers" style={{ color: V.muted, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>← BioMarkers</Link>
          <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{test.name}</div>
          <div style={{ fontSize: 12, color: V.muted }}>{test.groupName}</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, padding: 6, borderRadius: 18, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)", border: `1px solid ${V.border}` }}>
            <button style={{ ...btn, minWidth: 56, padding: "10px 0" }} onClick={() => prevTest && router.push(`/dashboard/biomarkers/${prevTest.id}`)} disabled={!prevTest} aria-label="Previous marker">‹</button>
            <button style={{ ...btn, minWidth: 56, padding: "10px 0" }} onClick={() => nextTest && router.push(`/dashboard/biomarkers/${nextTest.id}`)} disabled={!nextTest} aria-label="Next marker">›</button>
          </div>
          <button style={editMode ? { ...btn, minWidth: 160 } : btnP} onClick={() => editMode ? saveEdit() : setEditMode(true)}>{editMode ? "Save changes" : "Edit definition"}</button>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 20, display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.08em" }}>Latest value</div>
            <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{(latest?.valueNum ?? latest?.valueText) || "—"}</div>
            <div style={{ fontSize: 12, color: V.muted }}>{test.unit || "Text marker"} · {latest ? fmtDate(latest.testDate) : "No result yet"}</div>
          </div>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.08em" }}>Range status</div>
            <div style={{ display: "inline-flex", marginTop: 12, padding: "6px 12px", borderRadius: 999, background: tone.bg, color: tone.fg, fontWeight: 900, fontSize: 12 }}>{tone.label}</div>
            <div style={{ fontSize: 12, color: V.muted, marginTop: 10 }}>Reference: {rangeLabel(test)}</div>
          </div>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.08em" }}>Change vs previous</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8, color: deltaColorForTest(d.delta, latest?.valueNum ?? null, test) }}>{d.delta == null ? "—" : `${d.delta > 0 ? "+" : ""}${d.delta}`}</div>
            <div style={{ fontSize: 12, color: V.muted }}>{d.pct == null ? "No comparable previous value" : `${d.pct > 0 ? "+" : ""}${d.pct}%`}</div>
          </div>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.08em" }}>Recency</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8, color: overdueDays != null && overdueDays > 180 ? "#dc2626" : V.text }}>{overdueDays == null ? "No result" : `${overdueDays} days`}</div>
            <div style={{ fontSize: 12, color: V.muted }}>{overdueDays != null && overdueDays > 180 ? "Probably time for a retest" : "Still reasonably fresh"}</div>
          </div>
        </div>

        {editMode && (
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: V.faint, letterSpacing: "0.08em", marginBottom: 10 }}>Definition editor</div>
            <div style={{ padding: 10, borderRadius: 12, background: isDark ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.08)", color: "#b45309", fontSize: 12, marginBottom: 12 }}>
              Changing method, unit, or reference ranges can make old results look different without the body changing. Very modern problem. Edit carefully.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Method</span><input style={input} value={editFields.method} onChange={(e) => setEditFields((p) => ({ ...p, method: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Unit</span><input style={input} value={editFields.unit} onChange={(e) => setEditFields((p) => ({ ...p, unit: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Group</span><select style={input} value={editFields.groupName} onChange={(e) => setEditFields((p) => ({ ...p, groupName: e.target.value }))}><option value="">Select group</option>{existingGroups.map((g) => <option key={g} value={g}>{g}</option>)}<option value="__new__">+ Create new group</option></select></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Ref min</span><input style={input} type="number" value={editFields.refMin} onChange={(e) => setEditFields((p) => ({ ...p, refMin: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Ref max</span><input style={input} type="number" value={editFields.refMax} onChange={(e) => setEditFields((p) => ({ ...p, refMax: e.target.value }))} /></label>
              <div style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Computed range</span><div style={{ ...input, display: "flex", alignItems: "center" }}>{rangeLabel({ ...test, refMin: editFields.refMin === "" ? null : Number(editFields.refMin), refMax: editFields.refMax === "" ? null : Number(editFields.refMax), unit: editFields.unit })}</div></div>
              {editFields.groupName === "__new__" && <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>New group name</span><input style={input} value={editFields.newGroupName} onChange={(e) => setEditFields((p) => ({ ...p, newGroupName: e.target.value }))} /></label>}
            </div>
          </div>
        )}

        <div style={{ ...section, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: V.faint, letterSpacing: "0.08em" }}>Trend</div>
              <div style={{ fontSize: 12, color: V.muted }}>{numericPoints.length} numeric points{mixedMode ? " · text results excluded from chart" : ""}</div>
            </div>
            {mixedMode && <div style={{ padding: "5px 10px", borderRadius: 999, background: "rgba(99,102,241,0.12)", color: "#4f46e5", fontSize: 11, fontWeight: 800 }}>Mixed numeric/text history</div>}
          </div>
          <TrendChart points={numericPoints} refMin={test.refMin} refMax={test.refMax} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr", gap: 18 }}>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}><div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: V.faint, letterSpacing: "0.08em" }}>Result history</div><button style={historyEditMode ? btnP : btn} onClick={() => { if (historyEditMode) { void saveAllHistoryEdits(); } else { setEditingResults(Object.fromEntries(results.map((row) => [row.id, { valueNum: row.valueNum?.toString() ?? "", valueText: row.valueText ?? "", notes: row.notes ?? "" }]))); setHistoryEditMode(true); } }}>{historyEditMode ? "Save all" : "Edit all"}</button></div>
            <div style={{ display: "grid", gap: 8 }}>
              {[...results].reverse().map((row, idx, arr) => {
                const prev = idx > 0 ? arr[idx - 1] : undefined;
                const s = markerStatus(row, test);
                const t = statusTone(s);
                const dp = deltaPct(prev?.valueNum ?? null, row.valueNum ?? null);
                const rowEdit = historyEditMode;
                return (
                  <div key={row.id} style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "0.9fr 1.1fr 0.8fr 0.9fr", gap: 10, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{fmtDate(row.testDate)}</div>
                      {rowEdit ? <input style={{ ...input, marginTop: 6 }} value={editingResults[row.id]?.notes ?? row.notes} onChange={(e) => setEditingResults((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] ?? { valueNum: row.valueNum?.toString() ?? "", valueText: row.valueText ?? "", notes: row.notes ?? "" }), notes: e.target.value } }))} placeholder="Notes" /> : row.notes && <div style={{ fontSize: 11, color: V.muted }}>{row.notes}</div>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900 }}>{rowEdit ? (row.valueNum != null || numericPoints.length ? <input style={input} type="number" value={editingResults[row.id]?.valueNum ?? (row.valueNum?.toString() ?? "")} onChange={(e) => setEditingResults((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] ?? { valueNum: row.valueNum?.toString() ?? "", valueText: row.valueText ?? "", notes: row.notes ?? "" }), valueNum: e.target.value, valueText: "" } }))} /> : <input style={input} value={editingResults[row.id]?.valueText ?? row.valueText} onChange={(e) => setEditingResults((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] ?? { valueNum: row.valueNum?.toString() ?? "", valueText: row.valueText ?? "", notes: row.notes ?? "" }), valueText: e.target.value, valueNum: "" } }))} />) : ((row.valueNum ?? row.valueText) || "—")}</div>
                    <div style={{ padding: "4px 8px", borderRadius: 999, background: t.bg, color: t.fg, fontSize: 11, fontWeight: 800, width: "fit-content" }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: deltaColorForTest(dp.delta, row.valueNum ?? null, test), fontWeight: 800 }}>{dp.delta == null ? "—" : `${dp.delta > 0 ? "+" : ""}${dp.delta}${dp.pct != null ? ` (${dp.pct > 0 ? "+" : ""}${dp.pct}%)` : row.valueNum != null && prev?.valueNum === 0 ? " (New)" : ""}`}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 800, color: V.faint, letterSpacing: "0.08em", marginBottom: 12 }}>Correlation compare</div>
            <div style={{ display: "grid", gap: 10 }}>
              <select style={input} value={compareTestId} onChange={(e) => setCompareTestId(e.target.value)}>
                <option value="">Select another marker</option>
                {allTests.filter((x) => x.id !== test.id).map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
              </select>
              <div style={{ fontSize: 13, color: V.muted }}>Shared numeric dates: <strong style={{ color: V.text }}>{compareSeries.rows.length}</strong>{compareSeries.r != null ? <> · Approx r = <strong style={{ color: compareTone(compareSeries.r) }}>{compareSeries.r}</strong></> : null}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {compareSeries.rows.slice(-10).map((row) => (
                  <div key={row.date} style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr", gap: 10, padding: 8, background: V.input, borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: V.muted }}>{fmtShort(row.date)}</div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{row.a}</div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{row.b}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div style={{ position: "fixed", right: 16, bottom: 16, padding: "10px 14px", borderRadius: 12, background: isDark ? "#16352a" : "#ecfdf5", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)", fontSize: 13, fontWeight: 800 }}>{toast}</div>}
    </div>
  );
}
