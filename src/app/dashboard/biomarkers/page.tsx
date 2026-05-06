"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { nowDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";
import { searchBiomarkerRefs, findBiomarkerRef, type BiomarkerRef } from "@/lib/biomarkers_db";

const supabase = createClient;

// ============= TYPES =============
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

type Tab = "overview" | "groups" | "dates" | "compare" | "metrics" | "manage";

function formatDelta(value: number | null): string {
  if (value == null) return "—";
  const formatted = value.toFixed(3);
  // Remove trailing zeros: 12.500 → 12.5, 12.000 → 12
  return formatted.replace(/\.?0+$/, '');
}

// ============= DB CONVERTERS =============
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

// ============= HELPER FUNCTIONS =============
function getStatus(val: number | null, min: number | null, max: number | null, text: string): MarkerStatus {
  if (text) return "text";
  if (val == null) return "missing";
  if (min == null && max == null) return "no-range";
  if (min != null && val < min) return "low";
  if (max != null && val > max) return "high";
  return "normal";
}

function statusTone(s: MarkerStatus) {
  if (s === "high" || s === "low") return { label: s.toUpperCase(), bg: "#fee", fg: "#c00" };
  if (s === "normal") return { label: "OK", bg: "#efe", fg: "#070" };
  if (s === "text") return { label: "TEXT", bg: "#eef", fg: "#007" };
  return { label: "—", bg: "#f5f5f5", fg: "#999" };
}

function compareTone(delta: number | null) {
  if (delta == null) return "#999";
  if (delta > 0) return "#c00";
  if (delta < 0) return "#070";
  return "#999";
}

// ============= MAIN COMPONENT =============
export default function BioMarkersPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [tests, setTests] = useState<BiomarkerTest[]>([]);
  const [results, setResults] = useState<BiomarkerResult[]>([]);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [userId, setUserId] = useState("");
  const [isDark, setIsDark] = useState(false);
  
  // Compare tab states
  const [compareDate1, setCompareDate1] = useState<string>("");
  const [compareDate2, setCompareDate2] = useState<string>("");
  
  // By Date tab state
  const [selectedDate, setSelectedDate] = useState<string>("");
  
  // Manage tab states
  const [selectedGroup, setSelectedGroup] = useState<string>("");

  useEffect(() => {
    const cl = supabase();
    cl.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      loadData(user.id);
    });
    
    const darkMatch = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(darkMatch.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    darkMatch.addEventListener("change", handler);
    return () => darkMatch.removeEventListener("change", handler);
  }, []);

  async function loadData(uid: string) {
    const cl = supabase();
    const [tRes, rRes, mRes, sRes] = await Promise.all([
      cl.from("biomarker_tests").select("*").eq("user_id", uid).order("sort_order"),
      cl.from("biomarker_results").select("*").eq("user_id", uid).order("test_date", { ascending: false }),
      cl.from("body_metrics").select("*").eq("user_id", uid).order("measured_at", { ascending: false }),
      cl.from("biomarker_sessions").select("*").eq("user_id", uid).order("session_date", { ascending: false }),
    ]);
    
    if (tRes.data) setTests(tRes.data.map(dbToTest));
    if (rRes.data) {
      const rs = rRes.data.map(dbToResult);
      setResults(rs);
      // Auto-select first date for "By Date" tab
      if (rs.length > 0 && !selectedDate) {
        setSelectedDate(rs[0].testDate);
      }
      // Auto-select dates for compare
      const uniqueDates = Array.from(new Set(rs.map(r => r.testDate))).sort().reverse();
      if (uniqueDates.length >= 2) {
        if (!compareDate1) setCompareDate1(uniqueDates[0]);
        if (!compareDate2) setCompareDate2(uniqueDates[1]);
      }
    }
    if (mRes.data) setMetrics(mRes.data.map(dbToMetric));
    if (sRes.data) setSessions(sRes.data.map(dbToSession));
  }

  // ============= COMPUTED DATA =============
  const testMap = useMemo(() => new Map(tests.map(t => [t.id, t])), [tests]);
  
  const latestResults = useMemo(() => {
    const map = new Map<string, BiomarkerResult>();
    results.forEach(r => {
      if (!map.has(r.testId)) map.set(r.testId, r);
    });
    return map;
  }, [results]);

  const previousResults = useMemo(() => {
    const map = new Map<string, BiomarkerResult>();
    results.forEach(r => {
      const existing = map.get(r.testId);
      if (!existing) {
        // Find second-latest
        const testResults = results.filter(res => res.testId === r.testId);
        if (testResults.length >= 2) map.set(r.testId, testResults[1]);
      }
    });
    return map;
  }, [results]);

  const summary = useMemo(() => {
    let tracked = 0, abnormal = 0, newlyAbnormal = 0, backToNormal = 0;
    tests.forEach(t => {
      const latest = latestResults.get(t.id);
      const prev = previousResults.get(t.id);
      if (!latest) return;
      tracked++;
      const currStatus = getStatus(latest.valueNum, t.refMin, t.refMax, latest.valueText);
      const prevStatus = prev ? getStatus(prev.valueNum, t.refMin, t.refMax, prev.valueText) : "missing";
      
      if (currStatus === "high" || currStatus === "low") abnormal++;
      if ((currStatus === "high" || currStatus === "low") && prevStatus === "normal") newlyAbnormal++;
      if (currStatus === "normal" && (prevStatus === "high" || prevStatus === "low")) backToNormal++;
    });
    return { tracked, abnormal, newlyAbnormal, backToNormal };
  }, [tests, latestResults, previousResults]);

  const abnormalRows = useMemo(() => {
    const rows: { test: BiomarkerTest; latest: BiomarkerResult; delta: number | null; pct: number | null; status: MarkerStatus }[] = [];
    tests.forEach(t => {
      const latest = latestResults.get(t.id);
      if (!latest) return;
      const status = getStatus(latest.valueNum, t.refMin, t.refMax, latest.valueText);
      if (status !== "high" && status !== "low") return;
      
      const prev = previousResults.get(t.id);
      let delta: number | null = null;
      let pct: number | null = null;
      if (latest.valueNum != null && prev?.valueNum != null) {
        delta = latest.valueNum - prev.valueNum;
        pct = Math.round((delta / prev.valueNum) * 100);
      }
      rows.push({ test: t, latest, delta, pct, status });
    });
    return rows;
  }, [tests, latestResults, previousResults]);

  const groupCards = useMemo(() => {
    const groups = new Map<string, { groupName: string; tests: BiomarkerTest[]; abnormal: number }>();
    tests.forEach(t => {
      if (!groups.has(t.groupName)) {
        groups.set(t.groupName, { groupName: t.groupName, tests: [], abnormal: 0 });
      }
      const g = groups.get(t.groupName)!;
      g.tests.push(t);
      const latest = latestResults.get(t.id);
      if (latest) {
        const status = getStatus(latest.valueNum, t.refMin, t.refMax, latest.valueText);
        if (status === "high" || status === "low") g.abnormal++;
      }
    });
    
    // Sort groups alphabetically, but "Other" always last
    return Array.from(groups.values()).sort((a, b) => {
      if (a.groupName.toLowerCase() === "other") return 1;
      if (b.groupName.toLowerCase() === "other") return -1;
      return a.groupName.localeCompare(b.groupName);
    }).map(g => ({
      ...g,
      tests: g.tests.sort((a, b) => a.name.localeCompare(b.name)) // Sort tests alphabetically
    }));
  }, [tests, latestResults]);

  const resultsByDate = useMemo(() => {
    const map = new Map<string, BiomarkerResult[]>();
    results.forEach(r => {
      if (!map.has(r.testDate)) map.set(r.testDate, []);
      map.get(r.testDate)!.push(r);
    });
    return map;
  }, [results]);

  const uniqueDates = useMemo(() => 
    Array.from(new Set(results.map(r => r.testDate))).sort().reverse(),
    [results]
  );

  const compareData = useMemo((): CompareRow[] => {
    if (!compareDate1 || !compareDate2) return [];
    const date1Results = results.filter(r => r.testDate === compareDate1);
    const date2Results = results.filter(r => r.testDate === compareDate2);
    
    const rows: CompareRow[] = [];
    tests.forEach(t => {
      const r1 = date1Results.find(r => r.testId === t.id);
      const r2 = date2Results.find(r => r.testId === t.id);
      if (!r1 && !r2) return;
      
      const currVal = r1?.valueNum ?? null;
      const prevVal = r2?.valueNum ?? null;
      const delta = currVal != null && prevVal != null ? currVal - prevVal : null;
      const pct = delta != null && prevVal != null ? Math.round((delta / prevVal) * 100) : null;
      
      rows.push({
        testId: t.id,
        name: t.name,
        groupName: t.groupName,
        prevVal,
        currVal,
        prevText: r2?.valueText ?? "",
        currText: r1?.valueText ?? "",
        delta,
        pct,
        prevStatus: getStatus(prevVal, t.refMin, t.refMax, r2?.valueText ?? ""),
        currStatus: getStatus(currVal, t.refMin, t.refMax, r1?.valueText ?? ""),
      });
    });
    
    return rows.sort((a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name));
  }, [tests, results, compareDate1, compareDate2]);

  // ============= ACTIONS =============

  // ============= STYLES =============
  const V = isDark
    ? { bg: "#0d0f14", text: "#f8fafc", muted: "#94a3b8", faint: "#64748b", border: "#1e293b", accent: "#14b8a6", surface: "#1a1f2e" }
    : { bg: "#f9f8f5", text: "#111827", muted: "#6b7280", faint: "#9ca3af", border: "#e5e7eb", accent: "#0d9488", surface: "#ffffff" };

  const tab = (isActive: boolean) => ({
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 700,
    border: "none",
    background: isActive ? V.accent : "transparent",
    color: isActive ? "#fff" : V.text,
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.2s",
  });

  const section = {
    background: V.surface,
    border: `1px solid ${V.border}`,
    borderRadius: 16,
  };

  const btn = {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 700,
    border: `1px solid ${V.border}`,
    borderRadius: 8,
    background: V.surface,
    color: V.text,
    cursor: "pointer",
  };

  // ============= RENDER =============
  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "14px 24px" }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Bio<span style={{ color: V.accent }}>Markers</span></div>
        <div style={{ fontSize: 12, color: V.muted }}>Monitor what changed, not just what exists.</div>
      </div>

      {/* Tab Bar */}
      <div style={{ background: V.surface, borderBottom: `1px solid ${V.border}`, padding: "12px 24px", display: "flex", gap: 8, overflowX: "auto" }}>
        <button style={tab(activeTab === "overview")} onClick={() => setActiveTab("overview")}>Overview</button>
        <button style={tab(activeTab === "groups")} onClick={() => setActiveTab("groups")}>By Groups</button>
        <button style={tab(activeTab === "dates")} onClick={() => setActiveTab("dates")}>By Date</button>
        <button style={tab(activeTab === "compare")} onClick={() => setActiveTab("compare")}>Compare</button>
        <button style={tab(activeTab === "metrics")} onClick={() => setActiveTab("metrics")}>Body Metrics</button>
        <button style={tab(activeTab === "manage")} onClick={() => setActiveTab("manage")}>Manage</button>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        {activeTab === "overview" && (
          <OverviewTab 
            summary={summary}
            abnormalRows={abnormalRows}
            uniqueDates={uniqueDates}
            V={V}
            section={section}
            statusTone={statusTone}
            compareTone={compareTone}
          />
        )}
        
        {activeTab === "groups" && (
          <ByGroupsTab
            groupCards={groupCards}
            latestResults={latestResults}
            previousResults={previousResults}
            testMap={testMap}
            V={V}
            section={section}
            statusTone={statusTone}
            compareTone={compareTone}
          />
        )}
        
        {activeTab === "dates" && (
          <ByDateTab
            uniqueDates={uniqueDates}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            resultsByDate={resultsByDate}
            testMap={testMap}
            sessions={sessions}
            V={V}
            section={section}
            statusTone={statusTone}
          />
        )}
        
        {activeTab === "compare" && (
          <CompareTab
            uniqueDates={uniqueDates}
            compareDate1={compareDate1}
            compareDate2={compareDate2}
            setCompareDate1={setCompareDate1}
            setCompareDate2={setCompareDate2}
            compareData={compareData}
            testMap={testMap}
            V={V}
            section={section}
            statusTone={statusTone}
            compareTone={compareTone}
            isDark={isDark}
          />
        )}
        
        {activeTab === "metrics" && (
          <BodyMetricsTab
            metrics={metrics}
            V={V}
            section={section}
            isDark={isDark}
          />
        )}
        
        {activeTab === "manage" && (
          <ManageTab
            groupCards={groupCards}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            userId={userId}
            tests={tests}
            setTests={setTests}
            V={V}
            section={section}
            btn={btn}
          />
        )}
      </div>
    </div>
  );
}

// ============= TAB COMPONENTS =============

function OverviewTab({ summary, abnormalRows, uniqueDates, V, section, statusTone, compareTone }: any) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        {[
          { label: "Tracked markers", value: summary.tracked, color: V.text },
          { label: "Currently abnormal", value: summary.abnormal, color: "#dc2626" },
          { label: "Newly abnormal", value: summary.newlyAbnormal, color: "#d97706" },
          { label: "Back to normal", value: summary.backToNormal, color: "#059669" },
        ].map((card: { label: string; value: number; color: string }) => (
          <div key={card.label} style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Current Issues */}
      <div style={{ ...section, padding: 16 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Current issues</div>
        {abnormalRows.length === 0 ? (
          <div style={{ color: V.muted, fontSize: 13 }}>Nothing abnormal in the latest set. Rare and beautiful.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {abnormalRows.map(({ test, latest, delta, pct, status }: any) => {
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

      {/* Recent Sessions */}
      <div style={{ ...section, padding: 16 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Recent sessions</div>
        {uniqueDates.length === 0 ? (
          <div style={{ color: V.muted, fontSize: 13 }}>No test sessions recorded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {uniqueDates.slice(0, 5).map((date: string) => (
              <div key={date} style={{ fontSize: 14, color: V.text }}>• {new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ByGroupsTab({ groupCards, latestResults, previousResults, testMap, V, section, statusTone, compareTone }: any) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(groupCards.map((g: any) => g.groupName)));
  
  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };
  
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {groupCards.map((g: any) => {
        const isExpanded = expandedGroups.has(g.groupName);
        return (
          <div key={g.groupName} style={{ ...section, padding: 16 }}>
            <div 
              style={{ fontSize: 16, fontWeight: 800, marginBottom: isExpanded ? 12 : 0, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} 
              onClick={() => toggleGroup(g.groupName)}
            >
              <span>{g.groupName} <span style={{ fontSize: 12, color: V.muted }}>({g.tests.length} markers · {g.abnormal} abnormal)</span></span>
              <span style={{ fontSize: 20, fontWeight: 700, color: V.accent }}>{isExpanded ? "−" : "+"}</span>
            </div>
            {isExpanded && (
              <div style={{ display: "grid", gap: 8 }}>
                {g.tests.map((t: any) => {
                  const latest = latestResults.get(t.id);
                  const prev = previousResults.get(t.id);
                  const status = latest ? statusTone(getStatus(latest.valueNum, t.refMin, t.refMax, latest.valueText)) : { label: "—", bg: "#f5f5f5", fg: "#999" };
                  const delta = latest?.valueNum != null && prev?.valueNum != null ? latest.valueNum - prev.valueNum : null;
                  const pct = delta != null && prev?.valueNum != null ? Math.round((delta / prev.valueNum) * 100) : null;
                  
                  return (
                    <Link key={t.id} href={`/dashboard/biomarkers/${t.id}`} style={{ textDecoration: "none", color: V.text }}>
                      <div style={{ border: `1px solid ${V.border}`, borderRadius: 10, padding: 10, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, alignItems: "center", cursor: "pointer", transition: "all 0.2s" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{latest?.valueNum ?? latest?.valueText ?? "—"} <span style={{ fontSize: 10, color: V.muted }}>{t.unit}</span></div>
                        <span style={{ padding: "4px 10px", borderRadius: 999, background: status.bg, color: status.fg, fontSize: 11, fontWeight: 800, textAlign: "center" }}>{status.label}</span>
                        <div style={{ fontSize: 11, color: compareTone(delta), fontWeight: 700, textAlign: "right" }}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${formatDelta(delta)}${pct != null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}`}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ByDateTab({ uniqueDates, selectedDate, setSelectedDate, resultsByDate, testMap, sessions, V, section, statusTone }: any) {
  const sessionForDate = sessions.find((s: any) => s.sessionDate === selectedDate);
  const resultsForDate = resultsByDate.get(selectedDate) || [];
  
  // Group by test group
  const grouped = new Map<string, any[]>();
  resultsForDate.forEach((r: any) => {
    const test = testMap.get(r.testId);
    if (!test) return;
    if (!grouped.has(test.groupName)) grouped.set(test.groupName, []);
    grouped.get(test.groupName)!.push({ result: r, test });
  });
  
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Date Selector */}
      <div style={{ ...section, padding: 16 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Select Session Date</div>
        <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: `1px solid ${V.border}`, borderRadius: 8, background: V.surface, color: V.text }}>
          {uniqueDates.map((date: string) => (
            <option key={date} value={date}>{new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</option>
          ))}
        </select>
      </div>

      {/* Session Info */}
      {sessionForDate && (
        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Session Details</div>
          <div style={{ marginTop: 8, fontSize: 13, color: V.muted }}>
            {sessionForDate.totalPaidAed && <div>Cost: AED {sessionForDate.totalPaidAed}</div>}
            {sessionForDate.notes && <div style={{ marginTop: 4 }}>Notes: {sessionForDate.notes}</div>}
          </div>
        </div>
      )}

      {/* Results Grouped by Test Group */}
      {Array.from(grouped.entries()).map(([groupName, items]: [string, any[]]) => (
        <div key={groupName} style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{groupName} <span style={{ fontSize: 12, color: V.muted }}>({items.length} tests)</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            {items.map(({ result, test }: any) => {
              const status = statusTone(getStatus(result.valueNum, test.refMin, test.refMax, result.valueText));
              return (
                <div key={result.id} style={{ border: `1px solid ${V.border}`, borderRadius: 10, padding: 10, display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{test.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{result.valueNum ?? result.valueText ?? "—"} <span style={{ fontSize: 10, color: V.muted }}>{test.unit}</span></div>
                  <span style={{ padding: "4px 10px", borderRadius: 999, background: status.bg, color: status.fg, fontSize: 11, fontWeight: 800, textAlign: "center" }}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      
      {resultsForDate.length === 0 && (
        <div style={{ ...section, padding: 16, color: V.muted }}>No results for this date.</div>
      )}
    </div>
  );
}

function CompareTab({ uniqueDates, compareDate1, compareDate2, setCompareDate1, setCompareDate2, compareData, testMap, V, section, statusTone, compareTone, isDark }: any) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Date Selectors */}
      <div style={{ ...section, padding: 16 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Compare Dates</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
          <select value={compareDate1} onChange={(e) => setCompareDate1(e.target.value)} style={{ padding: "10px 14px", fontSize: 14, border: `1px solid ${V.border}`, borderRadius: 8, background: V.surface, color: V.text }}>
            {uniqueDates.map((date: string) => (
              <option key={date} value={date}>{new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</option>
            ))}
          </select>
          <div style={{ fontSize: 18, fontWeight: 800, color: V.accent }}>vs</div>
          <select value={compareDate2} onChange={(e) => setCompareDate2(e.target.value)} style={{ padding: "10px 14px", fontSize: 14, border: `1px solid ${V.border}`, borderRadius: 8, background: V.surface, color: V.text }}>
            {uniqueDates.map((date: string) => (
              <option key={date} value={date}>{new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Table */}
      <div style={{ ...section, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: isDark ? "#1a1f2e" : "#f3f4f6", borderBottom: `2px solid ${V.border}` }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 800, fontSize: 11, textTransform: "uppercase", color: V.faint }}>Test Name</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 800, fontSize: 11, textTransform: "uppercase", color: V.faint }}>{new Date(compareDate1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 800, fontSize: 11, textTransform: "uppercase", color: V.faint }}>{new Date(compareDate2).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 800, fontSize: 11, textTransform: "uppercase", color: V.faint }}>Δ</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 800, fontSize: 11, textTransform: "uppercase", color: V.faint }}>%</th>
            </tr>
          </thead>
          <tbody>
            {compareData.map((row: CompareRow) => {
              const test = testMap.get(row.testId);
              const currTone = statusTone(row.currStatus);
              const prevTone = statusTone(row.prevStatus);
              
              return (
                <tr key={row.testId} style={{ borderBottom: `1px solid ${V.border}` }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontSize: 10, color: V.faint, textTransform: "uppercase" }}>{row.groupName}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{row.name}</div>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{row.currVal ?? row.currText ?? "—"} <span style={{ fontSize: 10, color: V.muted }}>{test?.unit}</span></div>
                    <span style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 999, background: currTone.bg, color: currTone.fg, fontSize: 10, fontWeight: 800 }}>{currTone.label}</span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{row.prevVal ?? row.prevText ?? "—"} <span style={{ fontSize: 10, color: V.muted }}>{test?.unit}</span></div>
                    <span style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 999, background: prevTone.bg, color: prevTone.fg, fontSize: 10, fontWeight: 800 }}>{prevTone.label}</span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, fontWeight: 800, color: compareTone(row.delta) }}>
                    {row.delta == null ? "—" : `${row.delta > 0 ? "↑ +" : "↓ "}${formatDelta(row.delta)}`}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, fontWeight: 800, color: compareTone(row.delta) }}>
                    {row.pct == null ? "—" : `${row.pct > 0 ? "+" : ""}${row.pct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {compareData.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center", color: V.muted }}>No common tests between these two dates.</div>
        )}
      </div>

      {/* Legend */}
      <div style={{ ...section, padding: 16 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 8 }}>Legend</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
          <div>✅ Normal</div>
          <div>⚠️ Abnormal</div>
          <div>↑ Increased</div>
          <div>↓ Decreased</div>
        </div>
      </div>
    </div>
  );
}

function BodyMetricsTab({ metrics, V, section, isDark }: any) {
  const latest = metrics[0];
  const previous = metrics[1];
  
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {latest ? (
        <>
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Latest Measurements</div>
            <div style={{ fontSize: 13, color: V.muted, marginBottom: 16 }}>{new Date(latest.measuredAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
              {[
                { label: "Weight", value: latest.weightKg, unit: "kg", prev: previous?.weightKg },
                { label: "Height", value: latest.heightCm, unit: "cm", prev: previous?.heightCm },
                { label: "BMI", value: latest.bmi, unit: "", prev: previous?.bmi },
                { label: "Body Fat", value: latest.bodyFatPct, unit: "%", prev: previous?.bodyFatPct },
                { label: "Visceral Fat", value: latest.visceralFatL, unit: "L", prev: previous?.visceralFatL },
                { label: "Skeletal Muscle", value: latest.skeletalMuscleKg, unit: "kg", prev: previous?.skeletalMuscleKg },
              ].map((m: { label: string; value: number | null; unit: string; prev?: number | null }) => {
                const delta = m.value != null && m.prev != null ? m.value - m.prev : null;
                return (
                  <div key={m.label} style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800 }}>{m.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{m.value ?? "—"} <span style={{ fontSize: 14, color: V.muted }}>{m.unit}</span></div>
                    {delta !== null && (
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: delta > 0 ? "#c00" : delta < 0 ? "#070" : "#999" }}>
                        {delta > 0 ? "+" : ""}{formatDelta(delta)} {m.unit}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {latest.notes && (
              <div style={{ marginTop: 16, padding: 12, background: isDark ? "#1a1f2e" : "#f3f4f6", borderRadius: 8, fontSize: 13 }}>
                <div style={{ fontSize: 11, color: V.faint, textTransform: "uppercase", fontWeight: 800, marginBottom: 4 }}>Notes</div>
                {latest.notes}
              </div>
            )}
          </div>

          {/* History */}
          <div style={{ ...section, padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>History</div>
            <div style={{ display: "grid", gap: 8 }}>
              {metrics.slice(0, 10).map((m: any) => (
                <div key={m.id} style={{ padding: "8px 12px", border: `1px solid ${V.border}`, borderRadius: 8, fontSize: 13 }}>
                  <strong>{new Date(m.measuredAt).toLocaleDateString()}</strong> — Weight: {m.weightKg ?? "—"} kg, BMI: {m.bmi ?? "—"}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ ...section, padding: 40, textAlign: "center", color: V.muted }}>
          No body metrics recorded yet.
        </div>
      )}
    </div>
  );
}

function ManageTab({ groupCards, selectedGroup, setSelectedGroup, userId, tests, setTests, V, section, btn }: any) {
  const group = groupCards.find((g: any) => g.groupName === selectedGroup);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTests, setEditedTests] = useState<any[]>([]);
  const [showAddTest, setShowAddTest] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newTest, setNewTest] = useState({
    name: "",
    method: "",
    unit: "",
    refMin: "",
    refMax: "",
  });
  
  // Initialize editing state when group selected
  useEffect(() => {
    if (group) {
      setEditedTests(group.tests.map((t: any) => ({
        id: t.id,
        name: t.name,
        method: t.method,
        unit: t.unit,
        refMin: t.refMin ?? "",
        refMax: t.refMax ?? "",
        groupName: t.groupName,
      })));
    }
    setIsEditing(false);
  }, [group]);
  
  const updateTest = (index: number, field: string, value: any) => {
    const updated = [...editedTests];
    updated[index] = { ...updated[index], [field]: value };
    setEditedTests(updated);
  };
  
  const saveAllChanges = async () => {
    const cl = supabase();
    const updates = editedTests.map(test => 
      cl.from("biomarker_tests").update({
        name: test.name,
        method: test.method,
        unit: test.unit,
        ref_min: test.refMin === "" ? null : parseFloat(test.refMin),
        ref_max: test.refMax === "" ? null : parseFloat(test.refMax),
        group_name: test.groupName,
      }).eq("id", test.id)
    );
    
    await Promise.all(updates);
    
    // Update local state
    setTests((prev: any[]) => prev.map(t => {
      const updated = editedTests.find(e => e.id === t.id);
      return updated ? {
        ...t,
        name: updated.name,
        method: updated.method,
        unit: updated.unit,
        refMin: updated.refMin === "" ? null : parseFloat(updated.refMin),
        refMax: updated.refMax === "" ? null : parseFloat(updated.refMax),
        groupName: updated.groupName,
      } : t;
    }));
    
    setIsEditing(false);
  };
  
  const deleteTest = async (testId: string) => {
    if (!confirm("Delete this marker and all its results?")) return;
    const cl = supabase();
    await Promise.all([
      cl.from("biomarker_results").delete().eq("test_id", testId),
      cl.from("biomarker_tests").delete().eq("id", testId),
    ]);
    setTests((prev: any[]) => prev.filter(t => t.id !== testId));
    setEditedTests(prev => prev.filter(t => t.id !== testId));
  };
  
  const addNewTest = async () => {
    if (!newTest.name || !selectedGroup) return;
    const cl = supabase();
    const { data } = await cl.from("biomarker_tests").insert({
      user_id: userId,
      name: newTest.name,
      group_name: selectedGroup,
      method: newTest.method,
      unit: newTest.unit,
      ref_min: newTest.refMin === "" ? null : parseFloat(newTest.refMin),
      ref_max: newTest.refMax === "" ? null : parseFloat(newTest.refMax),
      sort_order: 0,
    }).select().single();
    
    if (data) {
      setTests((prev: any[]) => [...prev, {
        id: data.id,
        groupName: data.group_name,
        name: data.name,
        method: data.method,
        refRange: "",
        refMin: data.ref_min,
        refMax: data.ref_max,
        unit: data.unit,
        sortOrder: data.sort_order,
      }]);
    }
    
    setNewTest({ name: "", method: "", unit: "", refMin: "", refMax: "" });
    setShowAddTest(false);
  };
  
  const createNewGroup = async () => {
    if (!newGroupName.trim()) return;
    const cl = supabase();
    const { data } = await cl.from("biomarker_tests").insert({
      user_id: userId,
      name: "New Test",
      group_name: newGroupName.trim(),
      method: "",
      unit: "",
      ref_min: null,
      ref_max: null,
      sort_order: 0,
    }).select().single();
    
    if (data) {
      setTests((prev: any[]) => [...prev, {
        id: data.id,
        groupName: data.group_name,
        name: data.name,
        method: data.method,
        refRange: "",
        refMin: data.ref_min,
        refMax: data.ref_max,
        unit: data.unit,
        sortOrder: data.sort_order,
      }]);
      setSelectedGroup(newGroupName.trim());
    }
    
    setNewGroupName("");
    setShowCreateGroup(false);
  };
  
  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    border: `1px solid ${V.border}`,
    borderRadius: 6,
    background: V.surface,
    color: V.text,
  };
  
  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: V.faint,
    marginBottom: 4,
  };
  
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Create New Group */}
      <div style={{ ...section, padding: 16 }}>
        <button onClick={() => setShowCreateGroup(!showCreateGroup)} style={{ ...btn, width: "100%", fontWeight: 700, background: V.accent, color: "#fff", border: "none" }}>
          {showCreateGroup ? "− Cancel" : "+ Create New Group"}
        </button>
      </div>

      {showCreateGroup && (
        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Create New Group</div>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={labelStyle}>Group Name *</div>
              <input 
                type="text" 
                value={newGroupName} 
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Kidney Function, Thyroid Panel"
                style={inputStyle}
              />
            </div>
            <button onClick={createNewGroup} style={{ ...btn, background: V.accent, color: "#fff", fontWeight: 700, padding: "10px" }}>
              Create Group
            </button>
          </div>
        </div>
      )}
      
      {/* Group Selector */}
      <div style={{ ...section, padding: 16 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, fontWeight: 800, marginBottom: 12 }}>Select Group</div>
        <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: `1px solid ${V.border}`, borderRadius: 8, background: V.surface, color: V.text }}>
          <option value="">-- Select a group --</option>
          {groupCards.map((g: any) => (
            <option key={g.groupName} value={g.groupName}>{g.groupName} ({g.tests.length} markers)</option>
          ))}
        </select>
      </div>

      {/* Add New Test */}
      {group && (
        <div style={{ ...section, padding: 16 }}>
          <button onClick={() => setShowAddTest(!showAddTest)} style={{ ...btn, width: "100%", fontWeight: 700 }}>
            {showAddTest ? "− Cancel" : "+ Add Test to " + group.groupName}
          </button>
        </div>
      )}

      {showAddTest && (
        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Add New Test</div>
          <div style={{ display: "grid", gap: 12 }}>
            <input type="text" value={newTest.name} onChange={(e) => setNewTest({ ...newTest, name: e.target.value })} placeholder="Test Name" style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input type="text" value={newTest.unit} onChange={(e) => setNewTest({ ...newTest, unit: e.target.value })} placeholder="Unit (e.g., g/dL)" style={inputStyle} />
              <input type="text" value={newTest.method} onChange={(e) => setNewTest({ ...newTest, method: e.target.value })} placeholder="Method (e.g., HPLC)" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input type="number" step="0.01" value={newTest.refMin} onChange={(e) => setNewTest({ ...newTest, refMin: e.target.value })} placeholder="Min Ref" style={inputStyle} />
              <input type="number" step="0.01" value={newTest.refMax} onChange={(e) => setNewTest({ ...newTest, refMax: e.target.value })} placeholder="Max Ref" style={inputStyle} />
            </div>
            <button onClick={addNewTest} style={{ ...btn, background: V.accent, color: "#fff", fontWeight: 700, padding: "10px" }}>Add Test</button>
          </div>
        </div>
      )}

      {/* Edit Group */}
      {group && !isEditing && (
        <div style={{ ...section, padding: 16 }}>
          <button onClick={() => setIsEditing(true)} style={{ ...btn, width: "100%", fontWeight: 700, background: V.accent, color: "#fff", border: "none" }}>
            Edit All Tests in {group.groupName}
          </button>
        </div>
      )}

      {/* Edit Mode - All Tests */}
      {group && isEditing && (
        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Editing {group.groupName}</div>
          <div style={{ display: "grid", gap: 12 }}>
            {editedTests.map((test, index) => (
              <div key={test.id} style={{ border: `1px solid ${V.border}`, borderRadius: 8, padding: 12, display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                  <input type="text" value={test.name} onChange={(e) => updateTest(index, "name", e.target.value)} placeholder="Test Name" style={inputStyle} />
                  <select value={test.groupName} onChange={(e) => updateTest(index, "groupName", e.target.value)} style={inputStyle}>
                    {groupCards.map((g: any) => (
                      <option key={g.groupName} value={g.groupName}>{g.groupName}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <input type="text" value={test.unit} onChange={(e) => updateTest(index, "unit", e.target.value)} placeholder="Unit" style={inputStyle} />
                  <input type="text" value={test.method} onChange={(e) => updateTest(index, "method", e.target.value)} placeholder="Method" style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <input type="number" step="0.01" value={test.refMin} onChange={(e) => updateTest(index, "refMin", e.target.value)} placeholder="Min" style={inputStyle} />
                  <input type="number" step="0.01" value={test.refMax} onChange={(e) => updateTest(index, "refMax", e.target.value)} placeholder="Max" style={inputStyle} />
                  <button onClick={() => deleteTest(test.id)} style={{ ...btn, color: "#dc2626", borderColor: "#dc2626" }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button onClick={saveAllChanges} style={{ ...btn, flex: 1, background: V.accent, color: "#fff", fontWeight: 700, padding: "12px" }}>Save All Changes</button>
            <button onClick={() => setIsEditing(false)} style={{ ...btn, flex: 1, padding: "12px" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* View Mode - Test List */}
      {group && !isEditing && (
        <div style={{ ...section, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{group.groupName} <span style={{ fontSize: 12, color: V.muted }}>({group.tests.length} markers)</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            {group.tests.map((t: any) => (
              <div key={t.id} style={{ border: `1px solid ${V.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: V.muted, marginTop: 2 }}>
                  {t.unit && <span>Unit: {t.unit}</span>}
                  {t.method && <span> · Method: {t.method}</span>}
                  {(t.refMin || t.refMax) && <span> · Range: {t.refMin ?? "—"} - {t.refMax ?? "—"}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {!selectedGroup && (
        <div style={{ ...section, padding: 40, textAlign: "center", color: V.muted }}>
          Select a group above to manage its markers.
        </div>
      )}
    </div>
  );
}
