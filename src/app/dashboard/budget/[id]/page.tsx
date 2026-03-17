"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { nowDubai } from "@/lib/timezone";

type Currency = "AED" | "INR" | "USD";
type Status = "pending" | "paid" | "skipped" | "waived";

type DueItem = {
  id: string;
  name: string;
  group: string;
  dueDay: number | null;
  statementDay: number | null;
  defaultCurrency: Currency;
  defaultAmount: number | null;
  isFixed: boolean;
};

type DueEntry = {
  id: string;
  month: string;
  amount: number | null;
  currency: Currency;
  status: Status;
  paidAt: string | null;
  note: string;
};

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AE", { month: "long", year: "numeric" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function toAed(amount: number, currency: Currency, rates: Record<string, number>) {
  if (currency === "AED") return amount;
  return rates[currency] ? amount / rates[currency] : amount;
}

function nowMonth() {
  return nowDubai().slice(0, 7);
}

function addMonths(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function statusTone(status: Status) {
  if (status === "paid") return { bg: "rgba(22,163,74,0.12)", fg: "#16a34a" };
  if (status === "skipped") return { bg: "rgba(99,102,241,0.12)", fg: "#6366f1" };
  if (status === "waived") return { bg: "rgba(245,166,35,0.14)", fg: "#F5A623" };
  return { bg: "rgba(239,68,68,0.08)", fg: "#ef4444" };
}

function isSettled(status: Status) {
  return status === "paid" || status === "skipped" || status === "waived";
}

function pctDiff(prev: number | null, current: number) {
  if (!prev || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

export default function DueItemDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [item, setItem] = useState<DueItem | null>(null);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [fxByMonth, setFxByMonth] = useState<Record<string, Record<string, number>>>({});
  const [monthLocks, setMonthLocks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [isDark, setIsDark] = useState(false);

  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState<Currency>("AED");
  const [editNote, setEditNote] = useState("");
  const [editStatus, setEditStatus] = useState<Status>("pending");

  const [showAddMonth, setShowAddMonth] = useState(false);
  const [newMonth, setNewMonth] = useState(nowMonth());
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState<Currency>("AED");
  const [newNote, setNewNote] = useState("");
  const [newStatus, setNewStatus] = useState<Status>("pending");

  const [editStatDay, setEditStatDay] = useState("");
  const [editDueDay, setEditDueDay] = useState("");
  const [editingDates, setEditingDates] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const read = () => setIsDark(document.documentElement.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const [itemRes, entriesRes, settingsRes] = await Promise.all([
        supabase.from("due_items").select("*").eq("id", params.id).eq("user_id", user.id).single(),
        supabase.from("due_entries").select("*").eq("due_item_id", params.id).eq("user_id", user.id).order("month", { ascending: false }),
        supabase.from("due_month_settings").select("month,fx_rates,is_locked").eq("user_id", user.id),
      ]);

      if (itemRes.data) {
        const r = itemRes.data;
        const nextItem: DueItem = {
          id: r.id,
          name: r.name,
          group: r.group_name ?? "General",
          dueDay: r.due_date_day ?? r.due_day ?? null,
          statementDay: r.statement_date ?? null,
          defaultCurrency: (r.default_currency ?? "AED") as Currency,
          defaultAmount: r.default_amount ?? null,
          isFixed: r.is_fixed ?? false,
        };
        setItem(nextItem);
        setEditStatDay(nextItem.statementDay?.toString() ?? "");
        setEditDueDay(nextItem.dueDay?.toString() ?? "");
      }

      if (entriesRes.data) {
        setEntries(entriesRes.data.map((e: { id: string; month: string; amount: number | null; currency: string; status: string; paid_at: string | null; note: string | null }) => ({
          id: e.id,
          month: e.month,
          amount: e.amount ?? null,
          currency: (e.currency ?? "AED") as Currency,
          status: (e.status ?? "pending") as Status,
          paidAt: e.paid_at ?? null,
          note: e.note ?? "",
        })));
      }

      if (settingsRes.data) {
        const monthMap: Record<string, Record<string, number>> = {};
        for (const row of settingsRes.data) monthMap[row.month] = row.fx_rates ?? { INR: 25.2, USD: 3.67 };
        setFxByMonth(monthMap);
      }
      setLoading(false);
    }
    void load();
  }, [params.id]);

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout((showToast as unknown as { timer?: number }).timer);
    (showToast as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(""), 2500);
  }

  async function saveDates() {
    if (!item || !userId) return;
    const statement = editStatDay ? Number(editStatDay) : null;
    const due = editDueDay ? Number(editDueDay) : null;
    const { error } = await supabase.from("due_items").update({ statement_date: statement, due_date_day: due }).eq("id", item.id).eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    setItem((p) => (p ? { ...p, statementDay: statement, dueDay: due } : p));
    setEditingDates(false);
    showToast("Dates saved");
  }

  function startEdit(entry: DueEntry) {
    setEditingMonth(entry.month);
    setEditAmount(entry.amount?.toString() ?? "");
    setEditCurrency(entry.currency);
    setEditNote(entry.note ?? "");
    setEditStatus(entry.status);
  }

  async function saveEdit(entry: DueEntry) {
    if (!userId) return;
    const amount = editAmount === "" ? null : Number(editAmount);
    const paidAt = editStatus === "paid" ? entry.paidAt ?? nowDubai() : null;
    const { error } = await supabase.from("due_entries").update({ amount, currency: editCurrency, note: editNote, status: editStatus, paid_at: paidAt }).eq("id", entry.id).eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    setEntries((p) => p.map((e) => (e.id === entry.id ? { ...e, amount, currency: editCurrency, note: editNote, status: editStatus, paidAt } : e)));
    setEditingMonth(null);
    showToast("Updated");
  }

  async function addMissingMonth() {
    if (!userId || !item) return;
    if (entries.find((e) => e.month === newMonth)) {
      showToast("Month already exists");
      return;
    }
    const amount = newAmount === "" ? item.defaultAmount : Number(newAmount);
    const paidAt = newStatus === "paid" ? nowDubai() : null;
    const { data, error } = await supabase.from("due_entries").insert({
      user_id: userId,
      due_item_id: item.id,
      month: newMonth,
      amount,
      currency: newCurrency,
      status: newStatus,
      note: newNote,
      paid_at: paidAt,
    }).select("*").single();
    if (error || !data) {
      showToast(error?.message ?? "Could not add month");
      return;
    }
    const entry: DueEntry = {
      id: data.id,
      month: data.month,
      amount: data.amount ?? null,
      currency: (data.currency ?? "AED") as Currency,
      status: (data.status ?? "pending") as Status,
      paidAt: data.paid_at ?? null,
      note: data.note ?? "",
    };
    setEntries((p) => [entry, ...p].sort((a, b) => b.month.localeCompare(a.month)));
    setShowAddMonth(false);
    setNewMonth(nowMonth());
    setNewAmount("");
    setNewNote("");
    setNewStatus("pending");
    showToast("Month added");
  }

  async function updateStatus(entry: DueEntry, status: Status) {
    if (monthLocks[entry.month] ) { showToast("That month is locked"); return; }
    if (!userId) return;
    const paidAt = status === "paid" ? entry.paidAt ?? nowDubai() : null;
    const { error } = await supabase.from("due_entries").update({ status, paid_at: paidAt }).eq("id", entry.id).eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    setEntries((p) => p.map((e) => (e.id === entry.id ? { ...e, status, paidAt } : e)));
    showToast(`Status updated to ${status}`);
  }

  const nativeCurrency = item?.defaultCurrency ?? "AED";
  const stats = useMemo(() => {
    if (!item) return null;
    const settled = entries.filter((e) => isSettled(e.status));
    const paid = entries.filter((e) => e.status === "paid");
    const waived = entries.filter((e) => e.status === "waived").length;
    const skipped = entries.filter((e) => e.status === "skipped").length;

    let totalNative = 0;
    for (const e of paid) {
      const amt = e.amount ?? 0;
      const fx = fxByMonth[e.month] ?? { INR: 25.2, USD: 3.67 };
      if (e.currency === nativeCurrency) totalNative += amt;
      else if (nativeCurrency === "AED") totalNative += toAed(amt, e.currency, fx);
      else totalNative += toAed(amt, e.currency, fx) * (fx[nativeCurrency] ?? 1);
    }

    const avg = paid.length > 0 ? totalNative / paid.length : 0;
    const existingMonths = new Set(entries.map((e) => e.month));
    const firstMonth = entries.length > 0 ? entries[entries.length - 1].month : nowMonth();
    const allMonths: string[] = [];
    let cursor = firstMonth;
    while (cursor <= nowMonth()) {
      allMonths.push(cursor);
      cursor = addMonths(cursor, 1);
    }
    const missing = allMonths.filter((m) => !existingMonths.has(m));
    return { totalNative, avg, paidCount: paid.length, settledCount: settled.length, waived, skipped, missing };
  }, [entries, item, fxByMonth, nativeCurrency]);

  const chart = useMemo(() => {
    const visible = [...entries].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    const amounts = visible.map((entry) => entry.amount ?? 0);
    const max = Math.max(...amounts, 1);
    const avg = amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length : 0;
    const avgPct = (avg / max) * 100;
    return {
      avg,
      avgPct,
      points: visible.map((entry, index) => {
        const prev = index > 0 ? visible[index - 1] : null;
        const amount = entry.amount ?? 0;
        return {
          ...entry,
          pct: (amount / max) * 100,
          diffAbs: prev ? amount - (prev.amount ?? 0) : null,
          diffPct: prev ? pctDiff(prev.amount ?? 0, amount) : null,
        };
      }),
    };
  }, [entries]);

  const V = {
    bg: isDark ? "#0d0f14" : "#f9f8f5",
    card: isDark ? "#16191f" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text: isDark ? "#f0ede8" : "#1a1a1a",
    muted: isDark ? "#9ba3b2" : "#6b7280",
    faint: isDark ? "#5c6375" : "#9ca3af",
    input: isDark ? "#1e2130" : "#f9fafb",
    accent: "#F5A623",
  };
  const btn = { padding: "7px 13px", borderRadius: 9, border: `1px solid ${V.border}`, background: V.card, color: V.text, cursor: "pointer", fontSize: 12, fontWeight: 600 } as const;
  const btnP = { ...btn, background: V.accent, border: "none", color: "#fff", fontWeight: 700 } as const;
  const inp = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${V.border}`, background: V.input, color: V.text, fontSize: 13, outline: "none" } as const;
  const section = { background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden" as const, marginBottom: 16 };
  const sHead = { padding: "11px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: V.faint, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" };

  if (loading) return <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: V.bg }}><div style={{ width: 28, height: 28, border: `2.5px solid ${V.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if (!item) return <div style={{ padding: 40, background: V.bg, minHeight: "100vh", color: V.muted }}>Not found. <Link href="/dashboard/budget" style={{ color: V.accent }}>Back</Link></div>;

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${V.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/dashboard/budget" style={{ display: "flex", alignItems: "center", gap: 8, color: V.muted, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Due Tracker
        </Link>
        <button style={btnP} onClick={() => { setNewCurrency(item.defaultCurrency); setShowAddMonth(true); }}>+ Add month</button>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>{item.name}</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(245,166,35,0.12)", color: V.accent }}>{item.group}</span>
            {item.isFixed && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>Fixed</span>}
          </div>

          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editingDates ? 12 : 0, gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {!editingDates ? (
                  <>
                    {item.statementDay ? <span style={{ fontSize: 13, fontWeight: 700 }}>📋 Statement: <span style={{ color: "#F5A623" }}>{ordinal(item.statementDay)}</span></span> : <span style={{ fontSize: 13, color: V.faint }}>No statement date</span>}
                    {item.dueDay ? <span style={{ fontSize: 13, fontWeight: 700 }}>📅 Due: <span style={{ color: "#ef4444" }}>{ordinal(item.dueDay)}</span></span> : <span style={{ fontSize: 13, color: V.faint }}>No due date</span>}
                  </>
                ) : (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: "#F5A623" }}>Statement day:</span>
                      <input type="number" min="1" max="31" style={{ ...inp, width: 70, padding: "5px 8px" }} value={editStatDay} onChange={(e) => setEditStatDay(e.target.value)} />
                    </label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: "#ef4444" }}>Due day:</span>
                      <input type="number" min="1" max="31" style={{ ...inp, width: 70, padding: "5px 8px" }} value={editDueDay} onChange={(e) => setEditDueDay(e.target.value)} />
                    </label>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {editingDates ? (
                  <>
                    <button style={btnP} onClick={() => void saveDates()}>Save</button>
                    <button style={btn} onClick={() => setEditingDates(false)}>Cancel</button>
                  </>
                ) : (
                  <button style={btn} onClick={() => setEditingDates(true)}>Edit dates</button>
                )}
              </div>
            </div>
          </div>
        </div>

        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: `Total paid (${nativeCurrency})`, value: `${nativeCurrency} ${stats.totalNative.toFixed(0)}`, color: V.accent },
              { label: "Months paid", value: stats.paidCount, color: "#16a34a" },
              { label: "Settled", value: stats.settledCount, color: V.muted },
              { label: "Skipped / Waived", value: `${stats.skipped}/${stats.waived}`, color: V.faint },
            ].map((card) => (
              <div key={card.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "11px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {chart.points.length > 0 && (
          <div style={{ ...section, marginBottom: 20 }}>
            <div style={sHead}>Recent trend</div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: V.muted, marginBottom: 10 }}>Last {chart.points.length} month{chart.points.length > 1 ? "s" : ""} · Average {nativeCurrency} {chart.avg.toFixed(0)}</div>
              <div style={{ position: "relative", height: 180, border: `1px solid ${V.border}`, borderRadius: 12, padding: "12px 8px 28px", overflow: "hidden" }}>
                <svg width="100%" height="140" viewBox={`0 0 ${Math.max(chart.points.length, 1) * 44} 140`} preserveAspectRatio="none">
                  <line x1="0" y1={140 - (chart.avgPct / 100) * 120} x2={Math.max(chart.points.length, 1) * 44} y2={140 - (chart.avgPct / 100) * 120} stroke="#F5A623" strokeDasharray="5 5" strokeWidth="2" opacity="0.95" />
                  {chart.points.map((point, index) => {
                    const x = index * 44 + 22;
                    const h = Math.max((point.pct / 100) * 120, 4);
                    const y = 140 - h;
                    const tone = statusTone(point.status);
                    return (
                      <g key={point.month}>
                        <rect x={x - 12} y={y} width="24" height={h} rx="6" fill={tone.fg} opacity="0.88" />
                      </g>
                    );
                  })}
                </svg>
                <div style={{ position: "absolute", left: 12, right: 12, top: `${12 + (140 - (chart.avgPct / 100) * 120)}px`, borderTop: "1px dashed rgba(245,166,35,0.6)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", right: 12, top: `${4 + (140 - (chart.avgPct / 100) * 120)}px`, fontSize: 10, fontWeight: 800, color: V.accent, background: V.card, padding: "0 4px" }}>AVG</div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${chart.points.length}, minmax(0,1fr))`, gap: 6, marginTop: 8 }}>
                  {chart.points.map((point) => (
                    <div key={point.month} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: V.faint, fontWeight: 700 }}>{point.month.slice(5)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{point.currency} {(point.amount ?? 0).toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {stats && stats.missing.length > 0 && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>Missing {stats.missing.length} month{stats.missing.length > 1 ? "s" : ""}</div>
              <div style={{ fontSize: 11, color: V.faint, marginTop: 2 }}>{stats.missing.slice(0, 4).map(fmtMonth).join(", ")}{stats.missing.length > 4 ? ` +${stats.missing.length - 4} more` : ""}</div>
            </div>
            <button style={{ ...btnP, background: "#ef4444" }} onClick={() => { setNewCurrency(item.defaultCurrency); setNewMonth(stats.missing[0]); setShowAddMonth(true); }}>Add missing</button>
          </div>
        )}

        <div style={section}>
          <div style={{ ...sHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>All months ({entries.length})</span>
          </div>
          {entries.length === 0 && <div style={{ padding: "24px 16px", textAlign: "center", color: V.faint, fontSize: 13 }}>No records yet. Humans keep inventing bills though, so it won’t stay empty.</div>}
          {entries.map((entry, index) => {
            const isEditing = editingMonth === entry.month;
            const prev = index < entries.length - 1 ? entries[index + 1] : null;
            const aed = toAed(entry.amount ?? 0, entry.currency, fxByMonth[entry.month] ?? { INR: 25.2, USD: 3.67 });
            const diffAbs = prev ? (entry.amount ?? 0) - (prev.amount ?? 0) : null;
            const diffPct = prev ? pctDiff(prev.amount ?? 0, entry.amount ?? 0) : null;
            const tone = statusTone(entry.status);
            const strike = entry.status === "paid" || entry.status === "waived";

            return (
              <div key={entry.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}` }}>
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMonth(entry.month)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 84px 110px", gap: 8 }}>
                      <input type="number" style={inp} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Amount" />
                      <select style={inp} value={editCurrency} onChange={(e) => setEditCurrency(e.target.value as Currency)}>
                        <option>AED</option><option>INR</option><option>USD</option>
                      </select>
                      <select disabled={monthLocks[entry.month]} style={inp} value={editStatus} onChange={(e) => setEditStatus(e.target.value as Status)}>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="skipped">Skipped</option>
                        <option value="waived">Waived</option>
                      </select>
                    </div>
                    <input style={inp} value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note (optional)" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btnP} onClick={() => void saveEdit(entry)}>Save</button>
                      <button style={btn} onClick={() => setEditingMonth(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <select value={entry.status} onChange={(e) => void updateStatus(entry, e.target.value as Status)} style={{ ...inp, width: 110, padding: "5px 8px", fontSize: 12 }}>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="skipped">Skipped</option>
                        <option value="waived">Waived</option>
                      </select>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMonth(entry.month)}</div>
                        {entry.note && <div style={{ fontSize: 11, color: V.muted, fontStyle: "italic", marginTop: 2 }}>{entry.note}</div>}
                        {entry.status === "paid" && <div style={{ fontSize: 11, color: "#16a34a", marginTop: 2 }}>Paid: {fmtDateTime(entry.paidAt)}</div>}
                        {diffAbs !== null && (
                          <div style={{ fontSize: 11, color: diffAbs === 0 ? V.faint : diffAbs > 0 ? "#ef4444" : "#16a34a", marginTop: 4 }}>
                            vs previous: {diffAbs > 0 ? "+" : ""}{entry.currency} {diffAbs.toFixed(0)} {diffPct !== null ? `(${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%)` : "(new)"}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, textDecoration: entry.status === "waived" ? "line-through" : "none", color: strike ? V.faint : V.text }}>
                          {entry.currency} {entry.amount?.toLocaleString() ?? ""}
                        </div>
                        {entry.currency !== "AED" && entry.amount !== null && <div style={{ fontSize: 11, color: V.faint }}>≈ AED {aed.toFixed(0)}</div>}
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, display: "inline-block", marginTop: 3, background: tone.bg, color: tone.fg }}>{entry.status}</span>
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

      {showAddMonth && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowAddMonth(false)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(500px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Add month record</div>
              <button style={btn} onClick={() => setShowAddMonth(false)}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Month <input type="month" style={inp} value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 84px 110px", gap: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Amount <input type="number" style={inp} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder={`Default: ${item.defaultAmount ?? 0}`} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Cur <select style={inp} value={newCurrency} onChange={(e) => setNewCurrency(e.target.value as Currency)}><option>AED</option><option>INR</option><option>USD</option></select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Status <select style={inp} value={newStatus} onChange={(e) => setNewStatus(e.target.value as Status)}><option value="pending">Pending</option><option value="paid">Paid</option><option value="skipped">Skipped</option><option value="waived">Waived</option></select>
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Note <input style={inp} value={newNote} onChange={(e) => setNewNote(e.target.value)} />
              </label>
              {stats && stats.missing.length > 0 && (
                <div style={{ fontSize: 12, color: V.faint }}>
                  Missing: {stats.missing.slice(0, 6).map((m) => (
                    <button key={m} onClick={() => setNewMonth(m)} style={{ ...btn, padding: "2px 8px", fontSize: 11, marginLeft: 4, color: newMonth === m ? V.accent : V.muted }}>{m}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowAddMonth(false)}>Cancel</button>
              <button style={btnP} onClick={() => void addMissingMonth()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 20, right: 16, background: isDark ? "#1a3a2a" : "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 200 }}>{toast}</div>}
    </div>
  );
}
