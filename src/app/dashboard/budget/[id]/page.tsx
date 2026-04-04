"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { nowDubai } from "@/lib/timezone";

type Currency = "AED" | "INR" | "USD";
type Status = "pending" | "partial" | "paid" | "waived";

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
  amountPaid: number;
  lastPaidAt: string | null;
  carryForwardAmount: number;
  carriedForwardFrom: string | null;
};

type DueItemNav = {
  id: string;
  name: string;
};

type DuePayment = {
  id: string;
  dueEntryId: string;
  paidAmount: number;
  paidAt: string;
  note: string;
};

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AE", { month: "long", year: "numeric" });
}

function fmtMonthShort(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AE", { month: "short" });
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
  if (status === "partial") return { bg: "rgba(245,166,35,0.14)", fg: "#F5A623" };
  if (status === "waived") return { bg: "rgba(148,163,184,0.16)", fg: "#94a3b8" };
  return { bg: "rgba(239,68,68,0.08)", fg: "#ef4444" };
}

function isSettled(status: Status) {
  return status === "paid" || status === "waived";
}

function pctDiff(prev: number | null, current: number) {
  if (!prev || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function getEntryRemaining(entry?: DueEntry | null) {
  if (!entry) return 0;
  return (entry.amount ?? 0) + (entry.carryForwardAmount ?? 0) - (entry.amountPaid ?? 0);
}

function getTotalDue(entry?: DueEntry | null) {
  if (!entry) return 0;
  return (entry.amount ?? 0) + (entry.carryForwardAmount ?? 0);
}

function getCarryForwardAmount(entry?: DueEntry | null) {
  if (!entry) return 0;
  if (entry.status === "waived") return 0;
  return getTotalDue(entry) - (entry.amountPaid ?? 0);
}

function buildCarryForwardNote(previousMonth: string, currency: Currency, carryForwardAmount: number, existingNote?: string | null) {
  if (carryForwardAmount === 0) return (existingNote ?? "").trim();
  const label = carryForwardAmount < 0 ? "Credit carried from" : "Carry forward from";
  const carryLine = `${label} ${fmtMonth(previousMonth)}: ${currency} ${carryForwardAmount.toFixed(2)}`;
  const cleaned = (existingNote ?? "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("Carry forward from ") && !trimmed.startsWith("Credit carried from ");
    })
    .join("\n")
    .trim();
  return cleaned ? `${cleaned}\n${carryLine}` : carryLine;
}

export default function DueItemDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [item, setItem] = useState<DueItem | null>(null);
  const [itemNav, setItemNav] = useState<DueItemNav[]>([]);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [paymentsByEntry, setPaymentsByEntry] = useState<Record<string, DuePayment[]>>({});
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
  const [paymentModalEntry, setPaymentModalEntry] = useState<DueEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

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

      const [itemRes, entriesRes, settingsRes, navRes] = await Promise.all([
        supabase.from("due_items").select("*").eq("id", params.id).eq("user_id", user.id).single(),
        supabase.from("due_entries").select("*").eq("due_item_id", params.id).eq("user_id", user.id).order("month", { ascending: false }),
        supabase.from("due_month_settings").select("month,fx_rates,is_locked").eq("user_id", user.id),
        supabase.from("due_items").select("id,name,sort_order,created_at").eq("user_id", user.id).order("sort_order").order("created_at"),
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
          amountPaid: Number((e as { amount_paid?: number | null }).amount_paid ?? 0),
          lastPaidAt: (e as { last_paid_at?: string | null }).last_paid_at ?? null,
          carryForwardAmount: Number((e as { carry_forward_amount?: number | null }).carry_forward_amount ?? 0),
          carriedForwardFrom: (e as { carried_forward_from?: string | null }).carried_forward_from ?? null,
        })));

        const entryIds = entriesRes.data.map((e: { id: string }) => e.id);
        if (entryIds.length > 0) {
          const paymentsRes = await supabase
            .from("due_payments")
            .select("*")
            .in("due_entry_id", entryIds)
            .eq("user_id", user.id)
            .order("paid_at", { ascending: false });

          if (paymentsRes.data) {
            const grouped: Record<string, DuePayment[]> = {};
            for (const row of paymentsRes.data as Array<{ id: string; due_entry_id: string; paid_amount: number; paid_at: string; note: string | null }>) {
              if (!grouped[row.due_entry_id]) grouped[row.due_entry_id] = [];
              grouped[row.due_entry_id].push({
                id: row.id,
                dueEntryId: row.due_entry_id,
                paidAmount: Number(row.paid_amount ?? 0),
                paidAt: row.paid_at,
                note: row.note ?? "",
              });
            }
            setPaymentsByEntry(grouped);
          }
        }
      }

      if (settingsRes.data) {
        const monthMap: Record<string, Record<string, number>> = {};
        const locks: Record<string, boolean> = {};
        for (const row of settingsRes.data) {
          monthMap[row.month] = row.fx_rates ?? { INR: 25.2, USD: 3.67 };
          locks[row.month] = row.is_locked ?? false;
        }
        setFxByMonth(monthMap);
        setMonthLocks(locks);
      }
      if (navRes.data) {
        setItemNav(navRes.data.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
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

  async function refreshEntry(entryId: string) {
    const [entryRes, paymentsRes] = await Promise.all([
      supabase.from("due_entries").select("*").eq("id", entryId).maybeSingle(),
      supabase.from("due_payments").select("*").eq("due_entry_id", entryId).eq("user_id", userId ?? "").order("paid_at", { ascending: false }),
    ]);

    if (entryRes.error || !entryRes.data) {
      throw new Error(entryRes.error?.message ?? "Could not refresh due entry");
    }

    const refreshed: DueEntry = {
      id: entryRes.data.id,
      month: entryRes.data.month,
      amount: entryRes.data.amount ?? null,
      currency: (entryRes.data.currency ?? "AED") as Currency,
      status: (entryRes.data.status ?? "pending") as Status,
      paidAt: entryRes.data.paid_at ?? null,
      note: entryRes.data.note ?? "",
      amountPaid: Number(entryRes.data.amount_paid ?? 0),
      lastPaidAt: entryRes.data.last_paid_at ?? null,
      carryForwardAmount: Number(entryRes.data.carry_forward_amount ?? 0),
      carriedForwardFrom: entryRes.data.carried_forward_from ?? null,
    };

    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? refreshed : entry)));
    setPaymentsByEntry((prev) => ({
      ...prev,
      [entryId]: (paymentsRes.data ?? []).map((row: { id: string; due_entry_id: string; paid_amount: number; paid_at: string; note: string | null }) => ({
        id: row.id,
        dueEntryId: row.due_entry_id,
        paidAmount: Number(row.paid_amount ?? 0),
        paidAt: row.paid_at,
        note: row.note ?? "",
      })),
    }));
    return refreshed;
  }

  function openPaymentModal(entry: DueEntry) {
    if (monthLocks[entry.month]) {
      showToast("That month is locked");
      return;
    }
    const remaining = Math.max((entry.amount ?? 0) - (entry.amountPaid ?? 0), 0);
    if (remaining <= 0) {
      showToast("Nothing left to pay");
      return;
    }
    setPaymentModalEntry(entry);
    setPaymentAmount(remaining.toFixed(2));
    setPaymentNote("");
  }

  function closePaymentModal() {
    if (savingPayment) return;
    setPaymentModalEntry(null);
    setPaymentAmount("");
    setPaymentNote("");
  }

  async function submitPaymentModal() {
    if (!paymentModalEntry || !userId) return;
    const amount = Number(paymentAmount);
    const remaining = Math.max((paymentModalEntry.amount ?? 0) - (paymentModalEntry.amountPaid ?? 0), 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a valid payment amount");
      return;
    }
    setSavingPayment(true);
    const { error } = await supabase.from("due_payments").insert({
      user_id: userId,
      due_entry_id: paymentModalEntry.id,
      paid_amount: amount,
      note: paymentNote.trim() || null,
    });
    if (error) {
      setSavingPayment(false);
      showToast(error.message);
      return;
    }
    await refreshEntry(paymentModalEntry.id);
    closePaymentModal();
    setSavingPayment(false);
    showToast(amount >= remaining ? "Payment saved and cleared" : "Partial payment saved");
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
    const { error } = await supabase
      .from("due_entries")
      .update({ amount, currency: editCurrency, note: editNote, status: editStatus, paid_at: null })
      .eq("id", entry.id)
      .eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    await refreshEntry(entry.id);
    setEditingMonth(null);
    showToast("Updated");
  }

  async function addMissingMonth() {
    if (!userId || !item) return;
    if (entries.find((e) => e.month === newMonth)) {
      showToast("Month already exists");
      return;
    }
    const previousMonth = addMonths(newMonth, -1);
    const previousEntry = entries.find((e) => e.month === previousMonth);
    const baseAmount = newAmount === "" ? (item.defaultAmount ?? 0) : Number(newAmount);
    const carryForwardAmount = getCarryForwardAmount(previousEntry);
    const finalNote = buildCarryForwardNote(previousMonth, newCurrency, carryForwardAmount, newNote);

    const { data, error } = await supabase.from("due_entries").insert({
      user_id: userId,
      due_item_id: item.id,
      month: newMonth,
      amount: baseAmount,
      currency: newCurrency,
      status: newStatus,
      note: finalNote,
      paid_at: null,
      carry_forward_amount: carryForwardAmount,
      carried_forward_from: previousEntry?.id ?? null,
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
      amountPaid: Number(data.amount_paid ?? 0),
      lastPaidAt: data.last_paid_at ?? null,
      carryForwardAmount: Number(data.carry_forward_amount ?? 0),
      carriedForwardFrom: data.carried_forward_from ?? null,
    };
    setEntries((p) => [entry, ...p].sort((a, b) => b.month.localeCompare(a.month)));
    setShowAddMonth(false);
    setNewMonth(nowMonth());
    setNewAmount("");
    setNewNote("");
    setNewStatus("pending");
    showToast(carryForwardAmount > 0 ? "Month added with carry forward" : "Month added");
  }

  async function updateStatus(entry: DueEntry, status: Status) {
    if (monthLocks[entry.month] ) { showToast("That month is locked"); return; }
    if (!userId) return;
    if (status === "paid" || status === "partial") {
      openPaymentModal(entry);
      return;
    }
    const { error } = await supabase.from("due_entries").update({ status, paid_at: null }).eq("id", entry.id).eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    await refreshEntry(entry.id);
    showToast(`Status updated to ${status}`);
  }

  const nav = useMemo(() => {
    const idx = itemNav.findIndex((row) => row.id === params.id);
    return {
      prev: idx > 0 ? itemNav[idx - 1] : null,
      next: idx >= 0 && idx < itemNav.length - 1 ? itemNav[idx + 1] : null,
    };
  }, [itemNav, params.id]);

  const nativeCurrency = item?.defaultCurrency ?? "AED";
  const stats = useMemo(() => {
    if (!item) return null;
    const settled = entries.filter((e) => isSettled(e.status));
    const paid = entries.filter((e) => e.amountPaid > 0);
    const waived = entries.filter((e) => e.status === "waived").length;

    let totalNative = 0;
    for (const e of paid) {
      const amt = e.amountPaid ?? 0;
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
    return { totalNative, avg, paidCount: paid.length, settledCount: settled.length, waived, missing };
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={{ ...btn, opacity: nav.prev ? 1 : 0.45, cursor: nav.prev ? "pointer" : "not-allowed" }} disabled={!nav.prev} onClick={() => nav.prev && router.push(`/dashboard/budget/${nav.prev.id}`)} title={nav.prev ? `Previous: ${nav.prev.name}` : "No previous due"}>‹</button>
          <button style={{ ...btn, opacity: nav.next ? 1 : 0.45, cursor: nav.next ? "pointer" : "not-allowed" }} disabled={!nav.next} onClick={() => nav.next && router.push(`/dashboard/budget/${nav.next.id}`)} title={nav.next ? `Next: ${nav.next.name}` : "No next due"}>›</button>
          <button style={btnP} onClick={() => { setNewCurrency(item.defaultCurrency); setShowAddMonth(true); }}>+ Add month</button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>{item.name}</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(245,166,35,0.12)", color: V.accent }}>{item.group}</span>
            {item.isFixed && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>Fixed</span>}
            <div style={{ fontSize: 12, color: V.faint, marginTop: 2 }}>When a month is partial or pending, the unpaid amount is carried into the next month on top of the regular monthly due.</div>
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
              { label: "Waived", value: stats.waived, color: V.faint },
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
                      <div style={{ fontSize: 10, color: V.faint, fontWeight: 700 }}>{fmtMonthShort(point.month)}</div>
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
                      <input type="text" inputMode="decimal" style={inp} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="This month amount" />
                      <select style={inp} value={editCurrency} onChange={(e) => setEditCurrency(e.target.value as Currency)}>
                        <option>AED</option><option>INR</option><option>USD</option>
                      </select>
                      <select disabled={monthLocks[entry.month]} style={inp} value={editStatus} onChange={(e) => setEditStatus(e.target.value as Status)}>
                        <option value="pending">Pending</option>
                        <option value="partial" disabled>Partial (from payments)</option>
                        <option value="paid" disabled>Paid (from payments)</option>
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
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="waived">Waived</option>
                      </select>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMonth(entry.month)}</div>
                        {entry.note && <div style={{ fontSize: 11, color: V.muted, fontStyle: "italic", marginTop: 2, whiteSpace: "pre-line" }}>{entry.note}</div>}
                        {entry.carryForwardAmount !== 0 && (
                          <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>
                            {entry.carryForwardAmount < 0 ? "Credit carried" : "Carry forward"}: {entry.currency} {entry.carryForwardAmount.toFixed(2)} · This month amount: {entry.currency} {(entry.amount ?? 0).toFixed(2)}
                          </div>
                        )}
                        {entry.amountPaid > 0 && (
                          <div style={{ fontSize: 11, color: entry.status === "paid" ? "#16a34a" : V.accent, marginTop: 2 }}>
                            Paid so far: {entry.currency} {entry.amountPaid.toFixed(2)} · Remaining: {entry.currency} {getEntryRemaining(entry).toFixed(2)}
                            {entry.lastPaidAt ? ` · Last: ${fmtDateTime(entry.lastPaidAt)}` : ""}
                          </div>
                        )}
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
                          {entry.currency} {getTotalDue(entry).toLocaleString()}
                        </div>
                        {entry.carryForwardAmount !== 0 && <div style={{ fontSize: 11, color: entry.carryForwardAmount < 0 ? "#16a34a" : "#f59e0b" }}>{entry.carryForwardAmount < 0 ? "Credit" : "Carry fwd"} {entry.currency} {entry.carryForwardAmount.toFixed(2)}</div>}
                        {(entry.amountPaid > 0 || entry.carryForwardAmount !== 0) && <div style={{ fontSize: 11, color: V.faint }}>This month amount {entry.currency} {(entry.amount ?? 0).toFixed(2)}</div>}
                        {entry.currency !== "AED" && entry.amount !== null && <div style={{ fontSize: 11, color: V.faint }}>≈ AED {aed.toFixed(0)}</div>}
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, display: "inline-block", marginTop: 3, background: tone.bg, color: tone.fg }}>{entry.status}</span>
                      </div>
                      <button style={{ ...btn, color: "#16a34a" }} onClick={() => openPaymentModal(entry)} disabled={monthLocks[entry.month]}>Add payment</button>
                      <button style={btn} onClick={() => startEdit(entry)}>Edit</button>
                    </div>
                  </div>
                )}
                {!isEditing && paymentsByEntry[entry.id]?.length ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${V.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, marginBottom: 8 }}>Payment history</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {paymentsByEntry[entry.id].map((payment) => (
                        <div key={payment.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: V.muted, flexWrap: "wrap" }}>
                          <span><strong style={{ color: V.text }}>{entry.currency} {payment.paidAmount.toFixed(2)}</strong>{payment.note ? ` · ${payment.note}` : ""}</span>
                          <span>{fmtDateTime(payment.paidAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {paymentModalEntry && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={closePaymentModal}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(520px,100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Record payment</div>
                <div style={{ fontSize: 12, color: V.muted, marginTop: 4 }}>{item?.name ?? "Due item"} · {fmtMonth(paymentModalEntry.month)}</div>
              </div>
              <button style={{ ...btn, padding: "6px 10px" }} onClick={closePaymentModal} disabled={savingPayment}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                <div style={{ background: V.input, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{paymentModalEntry.currency} {getTotalDue(paymentModalEntry).toFixed(2)}</div>
                </div>
                <div style={{ background: V.input, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Paid so far</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: paymentModalEntry.amountPaid > 0 ? "#16a34a" : V.text }}>{paymentModalEntry.currency} {(paymentModalEntry.amountPaid ?? 0).toFixed(2)}</div>
                </div>
                <div style={{ background: V.input, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Remaining</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: V.accent }}>{paymentModalEntry.currency} {getEntryRemaining(paymentModalEntry).toFixed(2)}</div>
                </div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Payment amount
                <input type="text" inputMode="decimal" style={inp} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} disabled={savingPayment} />
              </label>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={{ ...btn, color: V.accent }} onClick={() => setPaymentAmount(getEntryRemaining(paymentModalEntry).toFixed(2))} disabled={savingPayment || getEntryRemaining(paymentModalEntry) <= 0}>Use remaining</button>
                {Math.max((paymentModalEntry.amount ?? 0) - (paymentModalEntry.amountPaid ?? 0), 0) > 1 && (
                  <button type="button" style={btn} onClick={() => setPaymentAmount((Math.max((paymentModalEntry.amount ?? 0) - (paymentModalEntry.amountPaid ?? 0), 0) / 2).toFixed(2))} disabled={savingPayment}>Half</button>
                )}
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Note
                <textarea style={{ ...inp, minHeight: 92, resize: "vertical" as const }} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Optional note or reference" disabled={savingPayment} />
              </label>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: V.faint }}>
                New remaining after this payment: {paymentModalEntry.currency} {(getEntryRemaining(paymentModalEntry) - (Number(paymentAmount) || 0)).toFixed(2)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} onClick={closePaymentModal} disabled={savingPayment}>Cancel</button>
                <button style={btnP} onClick={() => void submitPaymentModal()} disabled={savingPayment}>{savingPayment ? "Saving..." : "Save payment"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  Amount <input type="text" inputMode="decimal" style={inp} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder={`Default: ${item.defaultAmount ?? 0}`} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Cur <select style={inp} value={newCurrency} onChange={(e) => setNewCurrency(e.target.value as Currency)}><option>AED</option><option>INR</option><option>USD</option></select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Status <select style={inp} value={newStatus} onChange={(e) => setNewStatus(e.target.value as Status)}><option value="pending">Pending</option><option value="waived">Waived</option></select>
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Note <input style={inp} value={newNote} onChange={(e) => setNewNote(e.target.value)} />
              </label>
              {(() => {
                const previousMonth = addMonths(newMonth, -1);
                const previousEntry = entries.find((e) => e.month === previousMonth);
                const carryForwardAmount = getCarryForwardAmount(previousEntry);
                const baseAmount = newAmount === "" ? (item.defaultAmount ?? 0) : Number(newAmount || 0);
                                return (
                  <div style={{ fontSize: 12, color: V.muted, background: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.08)", border: `1px solid ${V.border}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 800, color: V.text, marginBottom: 4 }}>Carry forward preview</div>
                    <div>This month amount: {newCurrency} {baseAmount.toFixed(2)}</div>
                    <div>Carry forward from {fmtMonth(previousMonth)}: {newCurrency} {carryForwardAmount.toFixed(2)}</div>
                    <div style={{ marginTop: 4, color: V.accent, fontWeight: 800 }}>New total due: {newCurrency} {(baseAmount + carryForwardAmount).toFixed(2)}</div>
                  </div>
                );
              })()}
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
