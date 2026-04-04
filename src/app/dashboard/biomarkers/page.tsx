"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { nowDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";
import { searchBiomarkerRefs, findBiomarkerRef, type BiomarkerRef } from "@/lib/biomarkers_db";

const supabase = createClient;

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
  createdAt?: string;
};

type BiomarkerResult = {
  id: string;
  testId: string;
  testDate: string;
  valueNum: number | null;
  valueText: string;
  notes: string;
  createdAt?: string;
};

type BodyMetric = {
  id: string;
  measuredAt: string;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  visceralFatL: number | null;
  skeletalMuscleKg: number | null;
  notes: string;
};

type Session = {
  id: string;
  userId: string;
  sessionDate: string;
  totalPaidAed: number | null;
  notes: string;
};

type MarkerStatus = "low" | "normal" | "high" | "no-range" | "text" | "missing";

type CompareRow = {
  testId: string;
  name: string;
  groupName: string;
  prevVal: number | null;
  currVal: number | null;
  prevText: string;
  currText: string;
  delta: number | null;
  pct: number | null;
  prevStatus: MarkerStatus;
  currStatus: MarkerStatus;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToTest = (r: any): BiomarkerTest => ({
  id: r.id,
  groupName: r.group_name,
  name: r.name,
  method: r.method ?? "",
  refRange: r.ref_range ?? "",
  refMin: r.ref_min ?? null,
  refMax: r.ref_max ?? null,
  unit: r.unit ?? "",
  sortOrder: r.sort_order ?? 0,
  createdAt: r.created_at,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToResult = (r: any): BiomarkerResult => ({
  id: r.id,
  testId: r.test_id,
  testDate: r.test_date,
  valueNum: r.value_num ?? null,
  valueText: r.value_text ?? "",
  notes: r.notes ?? "",
  createdAt: r.created_at,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToMetric = (r: any): BodyMetric => ({
  id: r.id,
  measuredAt: r.measured_at,
  weightKg: r.weight_kg ?? null,
  heightCm: r.height_cm ?? null,
  bmi: r.bmi ?? null,
  bodyFatPct: r.body_fat_pct ?? null,
  visceralFatL: r.visceral_fat_l ?? null,
  skeletalMuscleKg: r.skeletal_muscle_kg ?? null,
  notes: r.notes ?? "",
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbToSession = (r: any): Session => ({
  id: r.id,
  userId: r.user_id,
  sessionDate: r.session_date,
  totalPaidAed: r.total_paid_aed ?? null,
  notes: r.notes ?? "",
});

function fmtDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtShort(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-AE", { day: "2-digit", month: "short" });
}

function fmtMoney(n: number | null | undefined) {
  return n == null ? "—" : `AED ${n.toFixed(2)}`;
}


function bodyMetricTone(kind: string, val: number | null) {
  if (val == null) return { bg: "rgba(107,114,128,0.12)", fg: "#6b7280", label: "No data" };
  const ranges: Record<string, [number, number]> = {
    weight: [70, 75],
    bmi: [21, 24],
    fat: [12, 20],
    skeletal: [32, 35],
    visceral: [2, 4],
  };
  const r = ranges[kind];
  if (!r) return { bg: "rgba(107,114,128,0.12)", fg: "#6b7280", label: "—" };
  const ok = val >= r[0] && val <= r[1];
  return ok ? { bg: "rgba(16,185,129,0.12)", fg: "#059669", label: `Optimal ${r[0]}-${r[1]}` } : { bg: "rgba(239,68,68,0.12)", fg: "#dc2626", label: `Target ${r[0]}-${r[1]}` };
}
function rangeLabel(test: BiomarkerTest) {
  if (test.refMin == null && test.refMax == null) return test.unit || "Text marker";
  if (test.refMin != null && test.refMax != null) return `${test.refMin} – ${test.refMax}${test.unit ? ` ${test.unit}` : ""}`;
  if (test.refMin != null) return `≥ ${test.refMin}${test.unit ? ` ${test.unit}` : ""}`;
  return `≤ ${test.refMax}${test.unit ? ` ${test.unit}` : ""}`;
}
function deltaColorForTest(delta: number | null, current: number | null, test: BiomarkerTest) {
  if (delta == null || current == null) return "#6b7280";
  const within = (test.refMin == null || current >= test.refMin) && (test.refMax == null || current <= test.refMax);
  return within ? "#059669" : "#dc2626";
}

function daysSince(dateStr: string) {
  const then = new Date(`${dateStr}T00:00:00`).getTime();
  const now = new Date().getTime();
  return Math.floor((now - then) / 86400000);
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
    case "low":
      return { bg: "rgba(59,130,246,0.12)", fg: "#2563eb", label: "Low" };
    case "high":
      return { bg: "rgba(239,68,68,0.12)", fg: "#dc2626", label: "High" };
    case "normal":
      return { bg: "rgba(16,185,129,0.12)", fg: "#059669", label: "Normal" };
    case "no-range":
      return { bg: "rgba(245,158,11,0.12)", fg: "#d97706", label: "No range" };
    case "text":
      return { bg: "rgba(99,102,241,0.12)", fg: "#4f46e5", label: "Text" };
    default:
      return { bg: "rgba(107,114,128,0.12)", fg: "#6b7280", label: "Missing" };
  }
}

function numericInputForTest(test: BiomarkerTest) {
  return Boolean(test.unit || test.refMin != null || test.refMax != null);
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

function dateKeySortDesc(a: string, b: string) {
  return b.localeCompare(a);
}

function TinyLineChart({
  points,
  refMin,
  refMax,
}: {
  points: { x: string; y: number }[];
  refMin: number | null;
  refMax: number | null;
}) {
  const W = 460;
  const H = 170;
  if (!points.length) return <div style={{ fontSize: 13, color: "#6b7280" }}>No numeric trend yet</div>;
  const values = points.map((p) => p.y);
  const minV = Math.min(...values, ...(refMin != null ? [refMin] : []), ...(refMax != null ? [refMax] : []));
  const maxV = Math.max(...values, ...(refMin != null ? [refMin] : []), ...(refMax != null ? [refMax] : []));
  const span = Math.max(maxV - minV, 1);
  const padX = 28;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const pt = points.map((p, i) => ({
    ...p,
    sx: padX + (i / Math.max(points.length - 1, 1)) * innerW,
    sy: padY + innerH - ((p.y - minV) / span) * innerH,
  }));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const avgY = padY + innerH - ((avg - minV) / span) * innerH;
  const line = pt.map((p) => `${p.sx},${p.sy}`).join(" ");
  const bandY1 = refMax == null ? null : padY + innerH - ((refMax - minV) / span) * innerH;
  const bandY2 = refMin == null ? null : padY + innerH - ((refMin - minV) / span) * innerH;
  const bandTop = bandY1 != null && bandY2 != null ? Math.min(bandY1, bandY2) : null;
  const bandHeight = bandY1 != null && bandY2 != null ? Math.abs(bandY1 - bandY2) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 190 }}>
      <rect x="0" y="0" width={W} height={H} rx="14" fill="transparent" />
      {bandTop != null && bandHeight != null && <rect x={padX} y={bandTop} width={innerW} height={bandHeight} fill="rgba(16,185,129,0.08)" />}
      <line x1={padX} y1={avgY} x2={W - padX} y2={avgY} stroke="#f59e0b" strokeDasharray="6 5" strokeWidth="2" />
      <polyline fill="none" stroke="#10b981" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={line} />
      {pt.map((p) => (
        <g key={`${p.x}-${p.y}`}>
          <circle cx={p.sx} cy={p.sy} r="4" fill="#10b981" />
          <text x={p.sx} y={H - 2} textAnchor="middle" fontSize="9" fill="#6b7280">{fmtShort(p.x)}</text>
        </g>
      ))}
      <text x={W - padX} y={avgY - 6} textAnchor="end" fontSize="10" fill="#d97706">Avg {avg.toFixed(2)}</text>
    </svg>
  );
}

export default function BiomarkersPage() {
  const client = supabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<BiomarkerTest[]>([]);
  const [results, setResults] = useState<BiomarkerResult[]>([]);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [toast, setToast] = useState("");
  const [showAddResult, setShowAddResult] = useState(false);
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddTest, setShowAddTest] = useState(false);
  const [addDate, setAddDate] = useState(nowDubai().slice(0, 10));
  const [addValues, setAddValues] = useState<Record<string, string>>({});
  const [sessionCost, setSessionCost] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [importText, setImportText] = useState("");
  const [metricForm, setMetricForm] = useState({ measuredAt: nowDubai().slice(0, 10), weightKg: "", heightCm: "", bodyFatPct: "", visceralFatL: "", skeletalMuscleKg: "", notes: "" });
  const [compareLeft, setCompareLeft] = useState("");
  const [compareRight, setCompareRight] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [testForm, setTestForm] = useState({ name: "", groupName: "", newGroupName: "", method: "", unit: "", refMin: "", refMax: "", sortOrder: "0" });
  const [dbSuggestions, setDbSuggestions] = useState<BiomarkerRef[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const V = {
    bg: isDark ? "#0d0f14" : "#f9f8f5",
    card: isDark ? "#16191f" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    text: isDark ? "#f0ede8" : "#1a1a1a",
    muted: isDark ? "#9ba3b2" : "#6b7280",
    faint: isDark ? "#6b7280" : "#9ca3af",
    input: isDark ? "#1e2130" : "#f7f7f8",
    accent: "#10b981",
  };
  const btn = { padding: "8px 14px", borderRadius: 10, border: `1px solid ${V.border}`, background: V.card, color: V.text, cursor: "pointer", fontSize: 12, fontWeight: 700 } as const;
  const btnP = { ...btn, background: V.accent, color: "#fff", border: "none" } as const;
  const input = { padding: "9px 12px", borderRadius: 10, border: `1px solid ${V.border}`, background: V.input, color: V.text, fontSize: 13, outline: "none" } as const;
  const section = { background: V.card, border: `1px solid ${V.border}`, borderRadius: 16 } as const;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  function openModal(setter: React.Dispatch<React.SetStateAction<boolean>>) {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      document.body.style.overflow = "hidden";
    }
    setter(true);
  }

  function closeModal(setter: React.Dispatch<React.SetStateAction<boolean>>) {
    setter(false);
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const [tRes, rRes, mRes, sRes] = await Promise.all([
        client.from("biomarker_tests").select("*").eq("user_id", user.id).order("group_name").order("sort_order"),
        client.from("biomarker_results").select("*").eq("user_id", user.id).order("test_date", { ascending: false }),
        client.from("body_metrics").select("*").eq("user_id", user.id).order("measured_at", { ascending: false }),
        client.from("biomarker_lab_sessions").select("*").eq("user_id", user.id).order("session_date", { ascending: false }),
      ]);
      setTests((tRes.data ?? []).map(dbToTest));
      setResults((rRes.data ?? []).map(dbToResult));
      setMetrics((mRes.data ?? []).map(dbToMetric));
      if (!sRes.error) setSessions((sRes.data ?? []).map(dbToSession));
      setLoading(false);
    }
    load();
  }, [client]);

  const resultsByTest = useMemo(() => {
    const map = new Map<string, BiomarkerResult[]>();
    for (const r of results) {
      const arr = map.get(r.testId) ?? [];
      arr.push(r);
      map.set(r.testId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.testDate.localeCompare(b.testDate));
    return map;
  }, [results]);

  const latestByTest = useMemo(() => {
    const map = new Map<string, BiomarkerResult>();
    for (const [testId, arr] of resultsByTest.entries()) {
      if (arr.length) map.set(testId, arr[arr.length - 1]);
    }
    return map;
  }, [resultsByTest]);

  const prevByTest = useMemo(() => {
    const map = new Map<string, BiomarkerResult | undefined>();
    for (const [testId, arr] of resultsByTest.entries()) {
      map.set(testId, arr.length > 1 ? arr[arr.length - 2] : undefined);
    }
    return map;
  }, [resultsByTest]);

  const groups = useMemo(() => {
    const grouped = new Map<string, BiomarkerTest[]>();
    for (const test of tests) {
      const arr = grouped.get(test.groupName) ?? [];
      arr.push(test);
      grouped.set(test.groupName, arr);
    }
    for (const arr of grouped.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tests]);

  const distinctDates = useMemo(() => Array.from(new Set(results.map((r) => r.testDate))).sort(dateKeySortDesc), [results]);
  useEffect(() => {
    if (!compareLeft && distinctDates[0]) setCompareLeft(distinctDates[0]);
    if (!compareRight && distinctDates[1]) setCompareRight(distinctDates[1]);
  }, [distinctDates, compareLeft, compareRight]);

  const compareRows = useMemo<CompareRow[]>(() => {
    if (!compareLeft || !compareRight) return [];
    const leftMap = new Map(results.filter((r) => r.testDate === compareLeft).map((r) => [r.testId, r]));
    const rightMap = new Map(results.filter((r) => r.testDate === compareRight).map((r) => [r.testId, r]));
    const rows: CompareRow[] = [];
    for (const test of tests) {
      const prev = rightMap.get(test.id);
      const curr = leftMap.get(test.id);
      if (!prev && !curr) continue;
      const d = deltaPct(prev?.valueNum ?? null, curr?.valueNum ?? null);
      rows.push({
        testId: test.id,
        name: test.name,
        groupName: test.groupName,
        prevVal: prev?.valueNum ?? null,
        currVal: curr?.valueNum ?? null,
        prevText: prev?.valueText ?? "",
        currText: curr?.valueText ?? "",
        delta: d.delta,
        pct: d.pct,
        prevStatus: markerStatus(prev, test),
        currStatus: markerStatus(curr, test),
      });
    }
    return rows.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  }, [compareLeft, compareRight, results, tests]);

  const summary = useMemo(() => {
    let abnormal = 0;
    let newlyAbnormal = 0;
    let backToNormal = 0;
    for (const test of tests) {
      const latest = latestByTest.get(test.id);
      const prev = prevByTest.get(test.id);
      const ls = markerStatus(latest, test);
      const ps = markerStatus(prev, test);
      const latestBad = ls === "low" || ls === "high";
      const prevBad = ps === "low" || ps === "high";
      if (latestBad) abnormal += 1;
      if (latestBad && !prevBad) newlyAbnormal += 1;
      if (!latestBad && prevBad) backToNormal += 1;
    }
    return { abnormal, newlyAbnormal, backToNormal, tracked: tests.length };
  }, [tests, latestByTest, prevByTest]);

  const abnormalRows = useMemo(() => {
    return tests
      .map((test) => {
        const latest = latestByTest.get(test.id);
        const prev = prevByTest.get(test.id);
        const status = markerStatus(latest, test);
        const prevStatus = markerStatus(prev, test);
        const d = deltaPct(prev?.valueNum ?? null, latest?.valueNum ?? null);
        return { test, latest, prev, status, prevStatus, delta: d.delta, pct: d.pct };
      })
      .filter((row) => row.status === "low" || row.status === "high")
      .sort((a, b) => a.test.groupName.localeCompare(b.test.groupName) || a.test.name.localeCompare(b.test.name));
  }, [tests, latestByTest, prevByTest]);

  const staleRows = useMemo(() => {
    return tests
      .map((test) => {
        const latest = latestByTest.get(test.id);
        return { test, latest, days: latest ? daysSince(latest.testDate) : null };
      })
      .filter((row) => row.days == null || row.days > 180)
      .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
  }, [tests, latestByTest]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, BiomarkerResult[]>();
    for (const r of results) {
      const arr = map.get(r.testDate) ?? [];
      arr.push(r);
      map.set(r.testDate, arr);
    }
    return Array.from(map.entries())
      .map(([date, rows]) => {
        const abnormalCount = rows.filter((r) => {
          const t = tests.find((x) => x.id === r.testId);
          return t && (markerStatus(r, t) === "low" || markerStatus(r, t) === "high");
        }).length;
        const session = sessions.find((s) => s.sessionDate === date);
        return { date, rows, abnormalCount, session };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [results, tests, sessions]);

  const bodyLatest = metrics[0] ?? null;

  const existingGroups = useMemo(() => groups.map(([groupName]) => groupName), [groups]);

  const groupCards = useMemo(() => {
    return groups.map(([groupName, list]) => {
      const abnormal = list.filter((test) => {
        const status = markerStatus(latestByTest.get(test.id), test);
        return status === "low" || status === "high";
      }).length;
      return { groupName, tests: list, abnormal };
    });
  }, [groups, latestByTest]);

  const corrPairs = useMemo(() => {
    const names = tests.map((t) => ({ id: t.id, name: t.name }));
    return names;
  }, [tests]);
  const [corrA, setCorrA] = useState("");
  const [corrB, setCorrB] = useState("");
  useEffect(() => {
    if (!corrA && corrPairs[0]) setCorrA(corrPairs[0].id);
    if (!corrB && corrPairs[1]) setCorrB(corrPairs[1].id);
  }, [corrPairs, corrA, corrB]);

  useEffect(() => {
    if (showAddResult || showAddMetric || showImport || showAddTest) {
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      if (typeof document !== "undefined") document.body.style.overflow = "hidden";
    } else {
      if (typeof document !== "undefined") document.body.style.overflow = "";
    }
    return () => {
      if (typeof document !== "undefined") document.body.style.overflow = "";
    };
  }, [showAddResult, showAddMetric, showImport, showAddTest]);
  const corrData = useMemo(() => {
    if (!corrA || !corrB || corrA === corrB) return { points: [] as { date: string; a: number; b: number }[], r: null as number | null };
    const aMap = new Map((resultsByTest.get(corrA) ?? []).filter((x) => x.valueNum != null).map((x) => [x.testDate, x.valueNum as number]));
    const points = (resultsByTest.get(corrB) ?? [])
      .filter((x) => x.valueNum != null && aMap.has(x.testDate))
      .map((x) => ({ date: x.testDate, a: aMap.get(x.testDate) as number, b: x.valueNum as number }));
    if (points.length < 2) return { points, r: null };
    const ax = points.map((p) => p.a);
    const bx = points.map((p) => p.b);
    const avgA = ax.reduce((s, v) => s + v, 0) / ax.length;
    const avgB = bx.reduce((s, v) => s + v, 0) / bx.length;
    const num = points.reduce((s, p) => s + (p.a - avgA) * (p.b - avgB), 0);
    const denA = Math.sqrt(points.reduce((s, p) => s + (p.a - avgA) ** 2, 0));
    const denB = Math.sqrt(points.reduce((s, p) => s + (p.b - avgB) ** 2, 0));
    return { points, r: denA && denB ? Number((num / (denA * denB)).toFixed(2)) : null };
  }, [corrA, corrB, resultsByTest]);

  async function saveResults() {
    if (!userId) return;
    const rows = tests
      .map((test) => ({ test, value: addValues[test.id]?.trim() ?? "" }))
      .filter(({ value }) => value !== "")
      .map(({ test, value }) => {
        const numeric = numericInputForTest(test);
        const num = Number(value);
        return {
          user_id: userId,
          test_id: test.id,
          test_date: addDate,
          value_num: numeric && Number.isFinite(num) ? num : null,
          value_text: numeric ? "" : value,
          notes: "",
        };
      });

    if (!rows.length) {
      showToast("Add at least one result");
      return;
    }

    const { data, error } = await client.from("biomarker_results").upsert(rows, { onConflict: "test_id,test_date" }).select("*");
    if (error) {
      showToast(error.message);
      return;
    }

    if (sessionCost.trim() || sessionNote.trim()) {
      await client.from("biomarker_lab_sessions").upsert({
        user_id: userId,
        session_date: addDate,
        total_paid_aed: sessionCost.trim() ? Number(sessionCost) : null,
        notes: sessionNote.trim(),
      }, { onConflict: "user_id,session_date" });
    }

    const saved = (data ?? []).map(dbToResult);
    setResults((prev) => {
      const keep = prev.filter((r) => !saved.some((s) => s.testId === r.testId && s.testDate === r.testDate));
      return [...saved, ...keep].sort((a, b) => b.testDate.localeCompare(a.testDate));
    });
    if (sessionCost.trim() || sessionNote.trim()) {
      const { data: sessionRows } = await client.from("biomarker_lab_sessions").select("*").eq("user_id", userId).eq("session_date", addDate).limit(1);
      if (sessionRows?.[0]) {
        setSessions((prev) => [dbToSession(sessionRows[0]), ...prev.filter((s) => s.sessionDate !== addDate)]);
      }
    }
    setAddValues({});
    setSessionCost("");
    setSessionNote("");
    closeModal(setShowAddResult);
    showToast(`Saved ${rows.length} results`);
  }

  async function saveMetric() {
    if (!userId) return;
    const w = metricForm.weightKg ? Number(metricForm.weightKg) : null;
    const h = metricForm.heightCm ? Number(metricForm.heightCm) : null;
    const bmi = w && h ? Number((w / ((h / 100) ** 2)).toFixed(1)) : null;
    const payload = {
      user_id: userId,
      measured_at: metricForm.measuredAt,
      weight_kg: w,
      height_cm: h,
      bmi,
      body_fat_pct: metricForm.bodyFatPct ? Number(metricForm.bodyFatPct) : null,
      visceral_fat_l: metricForm.visceralFatL ? Number(metricForm.visceralFatL) : null,
      skeletal_muscle_kg: metricForm.skeletalMuscleKg ? Number(metricForm.skeletalMuscleKg) : null,
      notes: metricForm.notes,
    };
    const { data, error } = await client.from("body_metrics").upsert(payload, { onConflict: "user_id,measured_at" }).select("*").single();
    if (error) {
      showToast(error.message);
      return;
    }
    if (data) {
      setMetrics((prev) => [dbToMetric(data), ...prev.filter((m) => m.measuredAt !== data.measured_at)].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
      closeModal(setShowAddMetric);
      showToast("Body metrics saved");
    }
  }

  async function importBulk() {
    if (!userId) return;
    const lines = importText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (!lines.length) {
      showToast("Paste something first");
      return;
    }
    const rows: { user_id: string; test_id: string; test_date: string; value_num: number | null; value_text: string; notes: string }[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,|]/).map((x) => x.trim());
      const [name, value, date, notes = ""] = parts;
      if (!name || !value || !date) continue;
      const test = tests.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!test) continue;
      const numeric = numericInputForTest(test);
      const num = Number(value);
      rows.push({
        user_id: userId,
        test_id: test.id,
        test_date: date,
        value_num: numeric && Number.isFinite(num) ? num : null,
        value_text: numeric ? "" : value,
        notes,
      });
    }
    if (!rows.length) {
      showToast("Nothing matched your test names");
      return;
    }
    const { data, error } = await client.from("biomarker_results").upsert(rows, { onConflict: "test_id,test_date" }).select("*");
    if (error) {
      showToast(error.message);
      return;
    }
    const saved = (data ?? []).map(dbToResult);
    setResults((prev) => {
      const keep = prev.filter((r) => !saved.some((s) => s.testId === r.testId && s.testDate === r.testDate));
      return [...saved, ...keep].sort((a, b) => b.testDate.localeCompare(a.testDate));
    });
    closeModal(setShowImport);
    setImportText("");
    showToast(`Imported ${saved.length} results`);
  }

  async function saveTestDefinition() {
    if (!userId) return;
    const groupName = testForm.groupName === "__new__" ? testForm.newGroupName.trim() : testForm.groupName.trim();
    if (!testForm.name.trim() || !groupName) {
      showToast("Name and group are required");
      return;
    }
    const payload = {
      user_id: userId,
      name: testForm.name.trim(),
      group_name: groupName,
      method: testForm.method.trim() || null,
      unit: testForm.unit.trim() || null,
      ref_min: testForm.refMin === "" ? null : Number(testForm.refMin),
      ref_max: testForm.refMax === "" ? null : Number(testForm.refMax),
      ref_range: null,
      sort_order: Number(testForm.sortOrder || 0),
    };
    const { data, error } = await client.from("biomarker_tests").insert(payload).select("*").single();
    if (error) { showToast(error.message); return; }
    if (data) {
      const mapped = dbToTest(data);
      setTests((prev) => [...prev, mapped].sort((a, b) => a.groupName.localeCompare(b.groupName) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      closeModal(setShowAddTest);
      setTestForm({ name: "", groupName: "", newGroupName: "", method: "", unit: "", refMin: "", refMax: "", sortOrder: "0" });
      setAddValues((prev) => ({ ...prev, [mapped.id]: "" }));
      showToast("Marker created");
    }
  }

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: V.bg, color: V.muted }}>Loading biomarkers…</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "14px 24px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Bio<span style={{ color: V.accent }}>Markers</span></div>
          <div style={{ fontSize: 12, color: V.muted }}>Monitor what changed, not just what exists.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => openModal(setShowImport)}>Bulk import</button>
          <button style={btn} onClick={() => openModal(setShowAddMetric)}>+ Body metrics</button>
          <button style={btn} onClick={() => openModal(setShowAddTest)}>+ Marker</button>
          <button style={btnP} onClick={() => openModal(setShowAddResult)}>+ Lab session</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20, display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          {[
            { label: "Tracked markers", value: summary.tracked, color: isDark ? "#f8fafc" : "#111827" },
            { label: "Currently abnormal", value: summary.abnormal, color: "#dc2626" },
            { label: "Newly abnormal", value: summary.newlyAbnormal, color: "#d97706" },
            { label: "Back to normal", value: summary.backToNormal, color: "#059669" },
          ].map((card) => (
            <div key={card.label} style={{ ...section, padding: 16 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800 }}>{card.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Current issues</div>
          {abnormalRows.length === 0 ? (
            <div style={{ color: V.muted, fontSize: 13 }}>Nothing abnormal in the latest set. Rare and beautiful.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {abnormalRows.map(({ test, latest, delta, pct, status }) => {
                const tone = statusTone(status);
                return (
                  <Link key={test.id} href={`/dashboard/biomarkers/${test.id}`} style={{ textDecoration: "none", color: V.text }}>
                    <div style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800 }}>{test.groupName}</div>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{test.name}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{latest?.valueNum ?? latest?.valueText ?? "—"} <span style={{ fontSize: 11, color: V.muted }}>{test.unit}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ padding: "4px 10px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 800 }}>{tone.label}</span>
                        <span style={{ fontSize: 12, color: compareTone(delta), fontWeight: 800 }}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}${pct != null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}`}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18 }}>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Groups at a glance</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
              {groupCards.map((g) => (
                <div key={g.groupName} style={{ border: `1px solid ${V.border}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{g.groupName}</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: V.muted }}>{g.tests.length} markers · {g.abnormal} abnormal</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {g.tests.slice(0, 6).map((t) => {
                      const status = markerStatus(latestByTest.get(t.id), t);
                      const tone = statusTone(status);
                      return <span key={t.id} style={{ padding: "4px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 700 }}>{t.name}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Stale or missing</div>
            <div style={{ display: "grid", gap: 8 }}>
              {staleRows.length === 0 ? (
                <div style={{ fontSize: 13, color: V.muted }}>Everything has a reasonably recent result.</div>
              ) : staleRows.slice(0, 12).map((row) => (
                <Link key={row.test.id} href={`/dashboard/biomarkers/${row.test.id}`} style={{ textDecoration: "none", color: V.text }}>
                  <div style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{row.test.name}</div>
                      <div style={{ fontSize: 11, color: V.muted }}>{row.test.groupName}</div>
                    </div>
                    <div style={{ fontSize: 12, color: row.days == null ? "#d97706" : "#dc2626", fontWeight: 800 }}>{row.days == null ? "No result" : `${row.days} days ago`}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...section, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800 }}>Compare two lab dates</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select style={input} value={compareLeft} onChange={(e) => setCompareLeft(e.target.value)}>{distinctDates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}</select>
              <select style={input} value={compareRight} onChange={(e) => setCompareRight(e.target.value)}>{distinctDates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}</select>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {compareRows.slice(0, 18).map((row) => {
              const tone = statusTone(row.currStatus);
              return (
                <div key={row.testId} style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.7fr", gap: 10, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{row.name}</div>
                    <div style={{ fontSize: 11, color: V.muted }}>{row.groupName}</div>
                  </div>
                  <div style={{ fontSize: 13, color: V.muted }}>{(row.prevVal ?? row.prevText) || "—"}</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{(row.currVal ?? row.currText) || "—"}</div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ padding: "4px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 800 }}>{tone.label}</span>
                    <span style={{ fontSize: 12, color: compareTone(row.delta), fontWeight: 800 }}>{row.delta == null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta}${row.pct != null ? ` (${row.pct > 0 ? "+" : ""}${row.pct}%)` : row.prevVal === 0 ? " (New)" : ""}`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 18 }}>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Lab sessions</div>
            <div style={{ display: "grid", gap: 10 }}>
              {sessionsByDate.map((bundle) => (
                <div key={bundle.date} style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{fmtDate(bundle.date)}</div>
                      <div style={{ fontSize: 12, color: V.muted }}>{bundle.rows.length} tests · {bundle.abnormalCount} abnormal · Total paid {fmtMoney(bundle.session?.totalPaidAed)}</div>
                    </div>
                    {bundle.session?.notes && <div style={{ fontSize: 12, color: V.muted, maxWidth: 300 }}>{bundle.session.notes}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {bundle.rows.slice(0, 10).map((r) => {
                      const t = tests.find((x) => x.id === r.testId);
                      if (!t) return null;
                      const tone = statusTone(markerStatus(r, t));
                      return <span key={r.id} style={{ padding: "4px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 700 }}>{t.name}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Correlation view</div>
            <div style={{ display: "grid", gap: 10 }}>
              <select style={input} value={corrA} onChange={(e) => setCorrA(e.target.value)}>{corrPairs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <select style={input} value={corrB} onChange={(e) => setCorrB(e.target.value)}>{corrPairs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <div style={{ fontSize: 13, color: V.muted }}>Shared dates: <strong style={{ color: V.text }}>{corrData.points.length}</strong>{corrData.r != null ? <> · Approx r = <strong style={{ color: compareTone(corrData.r) }}>{corrData.r}</strong></> : null}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {corrData.points.slice(-8).map((p) => (
                  <div key={p.date} style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr", gap: 10, padding: 8, borderRadius: 10, background: V.input }}>
                    <div style={{ fontSize: 12, color: V.muted }}>{fmtShort(p.date)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{p.a}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{p.b}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Tracked markers</div>
          <div style={{ display: "grid", gap: 14 }}>
            {groups.map(([groupName, list]) => {
              const collapsed = !!collapsedGroups[groupName];
              return (
              <div key={groupName}>
                <button style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, background: "transparent", border: "none", color: V.text, cursor: "pointer", padding: 0 }} onClick={() => setCollapsedGroups((p) => ({ ...p, [groupName]: !p[groupName] }))}><span style={{ fontSize: 15, fontWeight: 800 }}>{groupName}</span><span style={{ fontSize: 12, color: V.muted }}>{collapsed ? "Show" : "Hide"}</span></button>
                {!collapsed && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                  {list.map((test) => {
                    const latest = latestByTest.get(test.id);
                    const prev = prevByTest.get(test.id);
                    const status = markerStatus(latest, test);
                    const tone = statusTone(status);
                    const d = deltaPct(prev?.valueNum ?? null, latest?.valueNum ?? null);
                    return (
                      <Link key={test.id} href={`/dashboard/biomarkers/${test.id}`} style={{ textDecoration: "none", color: V.text }}>
                        <div style={{ border: `1px solid ${V.border}`, borderRadius: 14, padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 800 }}>{test.name}</div>
                            <span style={{ padding: "4px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 800 }}>{tone.label}</span>
                          </div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: isDark ? "#f8fafc" : V.text }}>{(latest?.valueNum ?? latest?.valueText) || "—"}</div>
                          <div style={{ fontSize: 12, color: V.muted }}>{rangeLabel(test)}</div>
                          <div style={{ fontSize: 12, color: deltaColorForTest(d.delta, latest?.valueNum ?? null, test), fontWeight: 800, marginTop: 8 }}>{d.delta == null ? "No numeric delta yet" : `${d.delta > 0 ? "+" : ""}${d.delta}${d.pct != null ? ` (${d.pct > 0 ? "+" : ""}${d.pct}%)` : ""}`}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>}
              </div>
            )})}
          </div>
        </div>

        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Body metrics</div>
          {bodyLatest ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              {[
                ["Weight", bodyLatest.weightKg, "kg", "weight"],
                ["BMI", bodyLatest.bmi, "", "bmi"],
                ["Body fat", bodyLatest.bodyFatPct, "%", "fat"],
                ["Visceral fat", bodyLatest.visceralFatL, "L", "visceral"],
                ["Skeletal muscle", bodyLatest.skeletalMuscleKg, "kg", "skeletal"],
              ].map(([label, val, unit, kind]) => {
                const tone = bodyMetricTone(String(kind), typeof val === "number" ? val : null);
                return (
                <div key={String(label)} style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{val ?? "—"} <span style={{ fontSize: 12, color: V.muted }}>{unit}</span></div>
                  <div style={{ marginTop: 8, display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 800 }}>{tone.label}</div>
                </div>
              )})}
              <div style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 12, gridColumn: "1/-1" }}>
                <div style={{ fontSize: 12, color: V.muted }}>Latest on {fmtDate(bodyLatest.measuredAt)}</div>
              </div>
            </div>
          ) : <div style={{ color: V.muted, fontSize: 13 }}>No body metrics yet.</div>}
        </div>
      </div>

      {showAddResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.56)", display: "grid", alignItems: "start", justifyItems: "center", padding: "72px 16px 24px", zIndex: 50 }}>
          <div style={{ width: "min(920px,100%)", maxHeight: "90vh", overflow: "auto", ...section }}>
            <div style={{ padding: 18, borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Add lab session</div>
                <div style={{ fontSize: 12, color: V.muted }}>Numeric tests get numeric input. Text-only tests stop polluting the chart. A modest miracle.</div>
              </div>
              <button style={btn} onClick={() => closeModal(setShowAddResult)}>Close</button>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Test date</span><input style={input} type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} /></label>
                <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Total paid that day (AED)</span><input style={input} type="number" min="0" value={sessionCost} onChange={(e) => setSessionCost(e.target.value)} /></label>
                <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Session note</span><input style={input} value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} placeholder="Optional" /></label>
              </div>
              {groups.map(([groupName, list]) => (
                <div key={groupName}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{groupName}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                    {list.map((test) => (
                      <label key={test.id} style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>{test.name} {test.unit ? `(${test.unit})` : ""}</span>
                        <input
                          style={input}
                          type={numericInputForTest(test) ? "number" : "text"}
                          step={numericInputForTest(test) ? "0.01" : undefined}
                          value={addValues[test.id] ?? ""}
                          onChange={(e) => setAddValues((prev) => ({ ...prev, [test.id]: e.target.value }))}
                          placeholder={numericInputForTest(test) ? `Numeric · ref ${test.refRange || "—"}` : "Text result"}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button style={btn} onClick={() => closeModal(setShowAddResult)}>Cancel</button>
                <button style={btnP} onClick={saveResults}>Save session</button>
              </div>
            </div>
          </div>
        </div>
      )}


      {showAddTest && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.56)", display: "grid", alignItems: "start", justifyItems: "center", padding: "72px 16px 24px", zIndex: 50 }}>
          <div style={{ width: "min(760px,100%)", ...section }}>
            <div style={{ padding: 18, borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Create marker</div>
                <div style={{ fontSize: 12, color: V.muted }}>Add a new tracked test and put it into an existing or new group.</div>
              </div>
              <button style={btn} onClick={() => closeModal(setShowAddTest)}>Close</button>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Test name</span><input style={input} value={testForm.name} onChange={(e) => setTestForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Group</span><select style={input} value={testForm.groupName} onChange={(e) => setTestForm((p) => ({ ...p, groupName: e.target.value }))}><option value="">Select group</option>{existingGroups.map((g) => <option key={g} value={g}>{g}</option>)}<option value="__new__">+ Create new group</option></select></label>
              {testForm.groupName === "__new__" && <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>New group name</span><input style={input} value={testForm.newGroupName} onChange={(e) => setTestForm((p) => ({ ...p, newGroupName: e.target.value }))} /></label>}
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Method</span><input style={input} value={testForm.method} onChange={(e) => setTestForm((p) => ({ ...p, method: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Unit</span><input style={input} value={testForm.unit} onChange={(e) => setTestForm((p) => ({ ...p, unit: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Ref min</span><input style={input} type="number" value={testForm.refMin} onChange={(e) => setTestForm((p) => ({ ...p, refMin: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Ref max</span><input style={input} type="number" value={testForm.refMax} onChange={(e) => setTestForm((p) => ({ ...p, refMax: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Sort order</span><input style={input} type="number" value={testForm.sortOrder} onChange={(e) => setTestForm((p) => ({ ...p, sortOrder: e.target.value }))} /></label>
              <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={btn} onClick={() => closeModal(setShowAddTest)}>Cancel</button><button style={btnP} onClick={saveTestDefinition}>Save marker</button></div>
            </div>
          </div>
        </div>
      )}

      {showAddMetric && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.56)", display: "grid", alignItems: "start", justifyItems: "center", padding: "72px 16px 24px", zIndex: 50 }}>
          <div style={{ width: "min(660px,100%)", ...section }}>
            <div style={{ padding: 18, borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Add body metrics</div>
              <button style={btn} onClick={() => closeModal(setShowAddMetric)}>Close</button>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Date</span><input style={input} type="date" value={metricForm.measuredAt} onChange={(e) => setMetricForm((p) => ({ ...p, measuredAt: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Weight (kg)</span><input style={input} type="number" value={metricForm.weightKg} onChange={(e) => setMetricForm((p) => ({ ...p, weightKg: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Height (cm)</span><input style={input} type="number" value={metricForm.heightCm} onChange={(e) => setMetricForm((p) => ({ ...p, heightCm: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Body fat %</span><input style={input} type="number" value={metricForm.bodyFatPct} onChange={(e) => setMetricForm((p) => ({ ...p, bodyFatPct: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Visceral fat (L)</span><input style={input} type="number" value={metricForm.visceralFatL} onChange={(e) => setMetricForm((p) => ({ ...p, visceralFatL: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Skeletal muscle (kg)</span><input style={input} type="number" value={metricForm.skeletalMuscleKg} onChange={(e) => setMetricForm((p) => ({ ...p, skeletalMuscleKg: e.target.value }))} /></label>
              <label style={{ display: "grid", gap: 6, gridColumn: "1/-1" }}><span style={{ fontSize: 12, color: V.muted, fontWeight: 700 }}>Notes</span><textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={metricForm.notes} onChange={(e) => setMetricForm((p) => ({ ...p, notes: e.target.value }))} /></label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, gridColumn: "1/-1" }}>
                <button style={btn} onClick={() => closeModal(setShowAddMetric)}>Cancel</button>
                <button style={btnP} onClick={saveMetric}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.56)", display: "grid", alignItems: "start", justifyItems: "center", padding: "72px 16px 24px", zIndex: 50 }}>
          <div style={{ width: "min(760px,100%)", ...section }}>
            <div style={{ padding: 18, borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Bulk import</div>
                <div style={{ fontSize: 12, color: V.muted }}>Paste rows like: <code>Name,Value,YYYY-MM-DD,Optional notes</code></div>
              </div>
              <button style={btn} onClick={() => closeModal(setShowImport)}>Close</button>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              <textarea style={{ ...input, minHeight: 220, resize: "vertical", fontFamily: "ui-monospace,monospace" }} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={`LDL,132,2026-03-18\nVitamin D,31,2026-03-18\nCOVID PCR,Negative,2026-03-18`} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button style={btn} onClick={() => closeModal(setShowImport)}>Cancel</button>
                <button style={btnP} onClick={importBulk}>Import</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", right: 16, bottom: 16, padding: "10px 14px", borderRadius: 12, background: isDark ? "#16352a" : "#ecfdf5", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)", fontSize: 13, fontWeight: 800 }}>{toast}</div>}
    </div>
  );
}
