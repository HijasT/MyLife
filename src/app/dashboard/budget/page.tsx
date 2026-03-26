"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";
import { nowDubai, todayDubai } from "@/lib/timezone";

type Currency = "AED" | "INR" | "USD";
type Status = "pending" | "partial" | "paid" | "skipped" | "waived";
type FilterKey = "all" | "pending" | "partial" | "paid" | "skipped" | "waived" | "overdue" | "upcoming";
type SortKey = "manual" | "dueDay" | "amountDesc" | "amountAsc" | "name" | "status";

type DueItem = {
  id: string;
  name: string;
  group: string;
  dueDay: number | null;
  statementDay: number | null;
  defaultCurrency: Currency;
  defaultAmount: number | null;
  isFixed: boolean;
  isHidden: boolean;
  sortOrder: number;
};

type DueEntry = {
  id: string;
  dueItemId: string;
  month: string;
  amount: number | null;
  currency: Currency;
  status: Status;
  paidAt: string | null;
  note: string;
  amountPaid: number;
  lastPaidAt: string | null;
};

type MonthSettings = {
  month: string;
  mainCurrency: Currency;
  note: string;
  cashIn: Record<string, number | string>;
  fxRates: Record<string, number>;
  groups: string[];
  remittanceInr: number | null;
  remittanceRate: number | null;
  remittanceStatus: Status;
  isLocked: boolean;
};

type ThemeVars = {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  input: string;
  accent: string;
};

const DEFAULT_GROUPS = ["UAE", "India"];
const DEFAULT_RATES: Record<string, number> = { INR: 25.2, USD: 3.67 };

function nowMonth() {
  return nowDubai().slice(0, 7);
}

function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AE", {
    month: "long",
    year: "numeric",
  });
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

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function daysBetween(fromDate: Date, toDate: Date) {
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function monthDayDate(baseMonth: string, day: number) {
  const [y, mo] = baseMonth.split("-").map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return new Date(y, mo - 1, Math.min(day, lastDay));
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMonthDay(date: Date) {
  return date.toLocaleDateString("en-AE", { month: "short", day: "numeric" });
}

function getCycleDates(statementDay: number | null, dueDay: number | null, todayIso: string, status?: Status) {
  if (!statementDay && !dueDay) return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const thisMonth = todayIso.slice(0, 7);
  const prev = prevMonth(thisMonth);
  const next = nextMonth(thisMonth);

  const buildPair = (statementMonth: string) => {
    const statementDate = statementDay ? monthDayDate(statementMonth, statementDay) : null;
    let dueDate: Date | null = null;
    if (dueDay) {
      const dueMonth = statementDay && statementDay < dueDay ? statementMonth : nextMonth(statementMonth);
      dueDate = monthDayDate(dueMonth, dueDay);
    }
    return { statementDate, dueDate };
  };

  const previousPair = buildPair(prev);
  const currentPair = buildPair(thisMonth);
  const nextPair = buildPair(next);

  let active = currentPair;
  if (currentPair.statementDate && today < currentPair.statementDate) {
    active = currentPair;
  } else if (currentPair.dueDate && today <= currentPair.dueDate) {
    active = currentPair;
  } else {
    active = nextPair;
  }

  let nextLabel: "statement" | "due" | null = null;
  let nextDate: Date | null = null;
  const settled = status ? isSettled(status) : false;

  if (settled) {
    if (active.dueDate && today <= active.dueDate && nextPair.statementDate) {
      nextLabel = "statement";
      nextDate = nextPair.statementDate;
    } else if (active.statementDate && today < active.statementDate) {
      nextLabel = "statement";
      nextDate = active.statementDate;
    } else if (nextPair.statementDate) {
      nextLabel = "statement";
      nextDate = nextPair.statementDate;
      active = nextPair;
    }
  } else {
    if (active.statementDate && today < active.statementDate) {
      nextLabel = "statement";
      nextDate = active.statementDate;
    } else if (active.dueDate && today <= active.dueDate) {
      nextLabel = "due";
      nextDate = active.dueDate;
    } else if (nextPair.statementDate) {
      nextLabel = "statement";
      nextDate = nextPair.statementDate;
      active = nextPair;
    }
  }

  return {
    statementDate: active.statementDate,
    dueDate: active.dueDate,
    nextLabel,
    nextDate,
    daysUntilNext: nextDate ? daysBetween(today, nextDate) : null,
    previousStatementDate: previousPair.statementDate,
    previousDueDate: previousPair.dueDate,
  };
}

function toAed(amount: number, currency: Currency, rates: Record<string, number>) {
  if (currency === "AED") return amount;
  const rate = rates[currency];
  return rate ? amount / rate : amount;
}

function getTheme(isDark: boolean): ThemeVars {
  return {
    bg: isDark ? "#0d0f14" : "#f9f8f5",
    card: isDark ? "#16191f" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text: isDark ? "#f0ede8" : "#1a1a1a",
    muted: isDark ? "#9ba3b2" : "#6b7280",
    faint: isDark ? "#5c6375" : "#9ca3af",
    input: isDark ? "#1e2130" : "#f9fafb",
    accent: "#F5A623",
  };
}

function isSettled(status: Status) {
  return status === "paid" || status === "skipped" || status === "waived";
}

function isPaid(status: Status) {
  return status === "paid";
}

function statusTone(status: Status) {
  if (status === "paid") return { bg: "rgba(22,163,74,0.12)", fg: "#16a34a" };
  if (status === "partial") return { bg: "rgba(245,166,35,0.14)", fg: "#F5A623" };
  if (status === "skipped") return { bg: "rgba(99,102,241,0.12)", fg: "#6366f1" };
  if (status === "waived") return { bg: "rgba(148,163,184,0.16)", fg: "#94a3b8" };
  return { bg: "rgba(239,68,68,0.08)", fg: "#ef4444" };
}

function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function remittanceStatusFromRow(row: { remittance_paid?: boolean | null; cash_in?: Record<string, unknown> | null }): Status {
  const raw = row.cash_in?.__remittance_status;
  if (raw === "pending" || raw === "partial" || raw === "paid" || raw === "skipped" || raw === "waived") return raw;
  return row.remittance_paid ? "paid" : "pending";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(r: any): DueItem {
  return {
    id: r.id,
    name: r.name,
    group: r.group_name ?? "General",
    dueDay: r.due_date_day ?? r.due_day ?? null,
    statementDay: r.statement_date ?? null,
    defaultCurrency: (r.default_currency ?? "AED") as Currency,
    defaultAmount: r.default_amount ?? null,
    isFixed: r.is_fixed ?? false,
    isHidden: r.is_hidden ?? false,
    sortOrder: r.sort_order ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEntry(r: any): DueEntry {
  return {
    id: r.id,
    dueItemId: r.due_item_id,
    month: r.month,
    amount: r.amount ?? null,
    currency: (r.currency ?? "AED") as Currency,
    status: (r.status ?? "pending") as Status,
    paidAt: r.paid_at ?? null,
    note: r.note ?? "",
    amountPaid: Number(r.amount_paid ?? 0),
    lastPaidAt: r.last_paid_at ?? null,
  };
}

export default function DueTrackerPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(nowMonth());
  const [items, setItems] = useState<DueItem[]>([]);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [prevEntries, setPrevEntries] = useState<DueEntry[]>([]);
  const [settings, setSettings] = useState<MonthSettings>({
    month: nowMonth(),
    mainCurrency: "AED",
    note: "",
    cashIn: {},
    fxRates: DEFAULT_RATES,
    groups: DEFAULT_GROUPS,
    remittanceInr: null,
    remittanceRate: null,
    remittanceStatus: "pending",
    isLocked: false,
  });
  const [showAddItem, setShowAddItem] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("manual");
  const [toast, setToast] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [remittanceEditMode, setRemittanceEditMode] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    group: "UAE",
    statementDay: "",
    dueDay: "",
    defaultCurrency: "AED" as Currency,
    defaultAmount: "",
    isFixed: false,
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = localStorage.getItem("due_collapsed");
      return raw ? new Set(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

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
        setLoading(false);
        return;
      }
      setUserId(user.id);
      await loadAll(user.id, month);
      setLoading(false);
    }
    void load();
  }, []);

  async function loadAll(uid: string, m: string) {
    const previous = prevMonth(m);
    const [itemsRes, entriesRes, settingsRes, prevEntriesRes] = await Promise.all([
      supabase.from("due_items").select("*").eq("user_id", uid).order("sort_order").order("created_at"),
      supabase.from("due_entries").select("*").eq("user_id", uid).eq("month", m),
      supabase.from("due_month_settings").select("*").eq("user_id", uid).eq("month", m).maybeSingle(),
      supabase.from("due_entries").select("*").eq("user_id", uid).eq("month", previous),
    ]);

    if (itemsRes.error) showToast(itemsRes.error.message);
    if (entriesRes.error) showToast(entriesRes.error.message);
    if (settingsRes.error) showToast(settingsRes.error.message);
    if (prevEntriesRes.error) showToast(prevEntriesRes.error.message);

    setItems((itemsRes.data ?? []).map(dbToItem));
    setEntries((entriesRes.data ?? []).map(dbToEntry));
    setPrevEntries((prevEntriesRes.data ?? []).map(dbToEntry));

    const s = settingsRes.data;
    setSettings(
      s
        ? {
            month: m,
            mainCurrency: (s.main_currency ?? "AED") as Currency,
            note: s.note ?? "",
            cashIn: s.cash_in ?? {},
            fxRates: s.fx_rates ?? DEFAULT_RATES,
            groups: s.groups ?? DEFAULT_GROUPS,
            remittanceInr: s.remittance_inr ?? null,
            remittanceRate: s.remittance_rate ?? null,
            remittanceStatus: remittanceStatusFromRow(s),
            isLocked: s.is_locked ?? false,
          }
        : {
            month: m,
            mainCurrency: "AED",
            note: "",
            cashIn: {},
            fxRates: DEFAULT_RATES,
            groups: DEFAULT_GROUPS,
            remittanceInr: null,
            remittanceRate: null,
            remittanceStatus: "pending",
    isLocked: false,
          },
    );
    markSynced();
  }

  async function changeMonth(next: string) {
    setMonth(next);
    if (userId) await loadAll(userId, next);
  }

  function getEntry(itemId: string) {
    return entries.find((e) => e.dueItemId === itemId);
  }

  function getPrevEntry(itemId: string) {
    return prevEntries.find((e) => e.dueItemId === itemId);
  }

  function effectiveAmount(item: DueItem, entry?: DueEntry) {
    return entry?.amount ?? item.defaultAmount ?? 0;
  }

  function effectiveCurrency(item: DueItem, entry?: DueEntry) {
    return (entry?.currency ?? item.defaultCurrency) as Currency;
  }

  async function ensureEntry(item: DueItem): Promise<DueEntry> {
    const existing = getEntry(item.id);
    if (existing) return existing;
    if (!userId) throw new Error("Missing user");

    let amount = item.defaultAmount;
    let currency = item.defaultCurrency;
    let note = "";
    const prev = getPrevEntry(item.id);
    if (item.isFixed && prev) {
      amount = prev.amount;
      currency = prev.currency;
      note = prev.note;
    }

    const { data, error } = await supabase
      .from("due_entries")
      .insert({
        user_id: userId,
        due_item_id: item.id,
        month,
        amount,
        currency,
        status: "pending",
        note,
      })
      .select("*")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create entry");
    const created = dbToEntry(data);
    setEntries((p) => [...p, created]);
    return created;
  }

  async function refreshEntry(entryId: string) {
    const { data, error } = await supabase.from("due_entries").select("*").eq("id", entryId).maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Could not refresh entry");
    const refreshed = dbToEntry(data);
    setEntries((p) => {
      const exists = p.some((e) => e.id === entryId);
      return exists ? p.map((e) => (e.id === entryId ? refreshed : e)) : [...p, refreshed];
    });
    return refreshed;
  }

  async function addPaymentToEntry(item: DueItem, explicitAmount?: number, explicitNote?: string) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    try {
      const entry = await ensureEntry(item);
      const totalAmount = entry.amount ?? item.defaultAmount ?? 0;
      const remaining = Math.max(totalAmount - (entry.amountPaid ?? 0), 0);
      if (remaining <= 0) {
        showToast("Nothing left to pay");
        return;
      }
      const rawAmount = explicitAmount ?? Number(window.prompt(`Payment amount for ${item.name} (${entry.currency}). Remaining: ${entry.currency} ${remaining.toFixed(2)}`, remaining.toFixed(2)));
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
        showToast("Payment cancelled");
        return;
      }
      const rawNote = explicitNote ?? window.prompt("Payment note (optional)", "") ?? "";
      const { error } = await supabase.from("due_payments").insert({
        user_id: userId,
        due_entry_id: entry.id,
        paid_amount: rawAmount,
        note: rawNote.trim() || null,
      });
      if (error) throw error;
      await refreshEntry(entry.id);
      showToast(rawAmount >= remaining ? "Payment saved and cleared" : "Partial payment saved");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save payment");
    }
  }

  async function updateEntryStatus(item: DueItem, status: Status) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    if (status === "paid" || status === "partial") {
      await addPaymentToEntry(item);
      return;
    }
    try {
      const entry = await ensureEntry(item);
      const { error } = await supabase
        .from("due_entries")
        .update({ status, paid_at: null })
        .eq("id", entry.id)
        .eq("user_id", userId ?? "");
      if (error) throw error;
      await refreshEntry(entry.id);
      showToast(`Status updated to ${status}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update status");
    }
  }

  async function updateEntryField(item: DueItem, field: "amount" | "currency" | "note", value: number | string | null) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    try {
      const entry = await ensureEntry(item);
      const { error } = await supabase
        .from("due_entries")
        .update({ [field]: value })
        .eq("id", entry.id)
        .eq("user_id", userId ?? "");
      if (error) throw error;
      setEntries((p) => p.map((e) => (e.id === entry.id ? { ...e, [field]: value } as DueEntry : e)));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update entry");
    }
  }

  async function saveSettings() {
    if (!userId) return;
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    const payload = {
      user_id: userId,
      month,
      main_currency: settings.mainCurrency,
      note: settings.note,
      cash_in: { ...settings.cashIn, __remittance_status: settings.remittanceStatus },
      fx_rates: settings.fxRates,
      groups: settings.groups,
      remittance_inr: settings.remittanceInr,
      remittance_rate: settings.remittanceRate,
      remittance_paid: settings.remittanceStatus === "paid",
      is_locked: settings.isLocked,
    };
    const { error } = await supabase.from("due_month_settings").upsert(payload, { onConflict: "user_id,month" });
    if (error) {
      showToast(error.message);
      return;
    }
    setShowSettings(false);
    showToast("Settings saved");
  }

  async function saveRemittance() {
    if (!userId) return;
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    const inr = settings.remittanceInr ?? 0;
    const rate = settings.remittanceRate ?? settings.fxRates.INR ?? 25.2;
    if (inr < 0) {
      showToast("Remittance INR cannot be negative");
      return;
    }
    if (rate <= 0) {
      showToast("Rate must be more than 0");
      return;
    }
    const { error } = await supabase.from("due_month_settings").upsert({
      user_id: userId,
      month,
      main_currency: settings.mainCurrency,
      note: settings.note,
      cash_in: { ...settings.cashIn, __remittance_status: settings.remittanceStatus },
      fx_rates: settings.fxRates,
      groups: settings.groups,
      remittance_inr: inr,
      remittance_rate: rate,
      remittance_paid: settings.remittanceStatus === "paid",
      is_locked: settings.isLocked,
    }, { onConflict: "user_id,month" });
    if (error) {
      showToast(error.message);
      return;
    }
    setRemittanceEditMode(false);
    showToast("Remittance saved");
  }

  async function addDueItem() {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    if (!userId || !newItem.name.trim()) return;
    const payload = {
      user_id: userId,
      name: newItem.name.trim(),
      group_name: newItem.group,
      statement_date: newItem.statementDay ? Number(newItem.statementDay) : null,
      due_date_day: newItem.dueDay ? Number(newItem.dueDay) : null,
      default_currency: newItem.defaultCurrency,
      default_amount: newItem.defaultAmount ? Number(newItem.defaultAmount) : null,
      is_fixed: newItem.isFixed,
    };
    const { data, error } = await supabase.from("due_items").insert(payload).select("*").single();
    if (error || !data) {
      showToast(error?.message ?? "Could not add item");
      return;
    }
    setItems((p) => [...p, dbToItem(data)]);
    setNewItem({ name: "", group: "UAE", statementDay: "", dueDay: "", defaultCurrency: "AED", defaultAmount: "", isFixed: false });
    setShowAddItem(false);
    showToast("Added");
  }

  async function toggleHide(item: DueItem) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    const { error } = await supabase.from("due_items").update({ is_hidden: !item.isHidden }).eq("id", item.id).eq("user_id", userId ?? "");
    if (error) {
      showToast(error.message);
      return;
    }
    setItems((p) => p.map((x) => (x.id === item.id ? { ...x, isHidden: !x.isHidden } : x)));
    showToast(item.isHidden ? "Item shown" : "Item hidden");
  }

  async function rollForwardFixedItems() {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    if (!userId) return;
    const sourceMonth = prevMonth(month);
    const fixedItems = items.filter((item) => item.isFixed);
    let created = 0;

    for (const item of fixedItems) {
      const existing = getEntry(item.id);
      if (existing) continue;
      const prev = prevEntries.find((e) => e.dueItemId === item.id);
      const { error } = await supabase.from("due_entries").insert({
        user_id: userId,
        due_item_id: item.id,
        month,
        amount: prev?.amount ?? item.defaultAmount,
        currency: prev?.currency ?? item.defaultCurrency,
        status: "pending",
        note: prev?.note ?? "",
      });
      if (!error) created += 1;
    }

    await loadAll(userId, month);
    showToast(created > 0 ? `Rolled forward ${created} fixed item${created > 1 ? "s" : ""} from ${sourceMonth}` : "Nothing to roll forward");
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      try {
        localStorage.setItem("due_collapsed", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout((showToast as unknown as { timer?: number }).timer);
    (showToast as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(""), 2600);
  }

  async function persistMonthSettings(next: Partial<MonthSettings>) {
    if (!userId) return false;
    const merged = { ...settings, ...next };
    const { error } = await supabase.from("due_month_settings").upsert({
      user_id: userId,
      month,
      main_currency: merged.mainCurrency,
      note: merged.note,
      cash_in: { ...merged.cashIn, __remittance_status: merged.remittanceStatus },
      fx_rates: merged.fxRates,
      groups: merged.groups,
      remittance_inr: merged.remittanceInr,
      remittance_rate: merged.remittanceRate,
      remittance_paid: merged.remittanceStatus === "paid",
      is_locked: merged.isLocked,
    }, { onConflict: "user_id,month" });
    if (error) {
      showToast(error.message);
      return false;
    }
    setSettings(merged);
    return true;
  }

  async function toggleMonthLock(force?: boolean) {
    if (!userId) return;
    const nextLocked = typeof force === "boolean" ? force : !settings.isLocked;
    const ok = await persistMonthSettings({ isLocked: nextLocked });
    if (ok) showToast(nextLocked ? "Month locked" : "Month unlocked");
  }

  const visibleItems = useMemo(() => (showHidden ? items : items.filter((item) => !item.isHidden)), [items, showHidden]);

  const remittanceSettled = isSettled(settings.remittanceStatus);

  const allVisibleSettled = useMemo(() => {
    const dueSettled = visibleItems.every((item) => isSettled(getEntry(item.id)?.status ?? "pending"));
    const needsRemittance = (settings.remittanceInr ?? 0) > 0;
    return dueSettled && (!needsRemittance || remittanceSettled);
  }, [visibleItems, entries, settings.remittanceInr, settings.remittanceStatus]);

  useEffect(() => {
    if (!userId || loading) return;
    if (settings.isLocked || !allVisibleSettled) return;
    void toggleMonthLock(true);
  }, [allVisibleSettled, userId, loading]);

  const today = todayDubai();
  const currentDay = Number(today.slice(8, 10));

  const enrichedItems = useMemo(() => {
    return visibleItems.map((item) => {
      const entry = getEntry(item.id);
      const prev = getPrevEntry(item.id);
      const amount = effectiveAmount(item, entry);
      const currency = effectiveCurrency(item, entry);
      const prevAmount = prev?.amount ?? item.defaultAmount ?? null;
      const diffAbs = prevAmount == null ? null : amount - prevAmount;
      const diffPct = prevAmount && prevAmount !== 0 ? ((amount - prevAmount) / prevAmount) * 100 : null;
      const cycle = getCycleDates(item.statementDay, item.dueDay, today, entry?.status ?? "pending");
      const overdue = !!cycle?.dueDate && cycle.dueDate < new Date(`${today}T00:00:00`) && !(entry && isSettled(entry.status));
      const upcoming = !!cycle?.nextDate && (cycle.daysUntilNext ?? 99) >= 0 && (cycle.daysUntilNext ?? 99) <= 3 && !(entry && isSettled(entry.status));
      return { item, entry, amount, currency, diffAbs, diffPct, overdue, upcoming, cycle };
    });
  }, [visibleItems, entries, prevEntries, month, currentDay, today]);

  const filteredSortedItems = useMemo(() => {
    const statusRank: Record<Status, number> = { pending: 0, partial: 1, paid: 2, skipped: 3, waived: 4 };
    const filtered = enrichedItems.filter(({ entry, overdue, upcoming }) => {
      const status = entry?.status ?? "pending";
      if (filter === "all") return true;
      if (filter === "overdue") return overdue;
      if (filter === "upcoming") return upcoming;
      return status === filter;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "manual") return a.item.sortOrder - b.item.sortOrder || a.item.name.localeCompare(b.item.name);
      if (sortBy === "dueDay") return (a.item.dueDay ?? 99) - (b.item.dueDay ?? 99) || a.item.name.localeCompare(b.item.name);
      if (sortBy === "amountDesc") return b.amount - a.amount;
      if (sortBy === "amountAsc") return a.amount - b.amount;
      if (sortBy === "name") return a.item.name.localeCompare(b.item.name);
      return statusRank[a.entry?.status ?? "pending"] - statusRank[b.entry?.status ?? "pending"];
    });
  }, [enrichedItems, filter, sortBy]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filteredSortedItems>();
    for (const row of filteredSortedItems) {
      const g = row.item.group || "General";
      if (!map.has(g)) map.set(g, []);
      map.get(g)?.push(row);
    }
    return map;
  }, [filteredSortedItems]);

  const indiaTotalInr = useMemo(() => {
    return items
      .filter((item) => item.group === "India")
      .reduce((sum, item) => {
        const entry = getEntry(item.id);
        const amount = effectiveAmount(item, entry);
        const cur = effectiveCurrency(item, entry);
        return sum + (cur === "INR" ? amount : toAed(amount, cur, settings.fxRates) * (settings.fxRates.INR ?? 25.2));
      }, 0);
  }, [items, entries, settings.fxRates]);

  const remittanceInr = settings.remittanceInr ?? 0;
  const remittanceRate = settings.remittanceRate ?? settings.fxRates.INR ?? 25.2;
  const remittanceAed = remittanceInr > 0 && remittanceRate > 0 ? remittanceInr / remittanceRate : 0;
  const remittanceDiffInr = remittanceInr - indiaTotalInr;
  const remittanceDiffAed = remittanceRate > 0 ? remittanceDiffInr / remittanceRate : 0;

  const stats = useMemo(() => {
    let totalAed = 0;
    let paidAed = 0;
    let settledCount = 0;
    let itemCount = 0;

    for (const item of items.filter((i) => i.group !== "India")) {
      const entry = getEntry(item.id);
      const amount = effectiveAmount(item, entry);
      const currency = effectiveCurrency(item, entry);
      const aed = toAed(amount, currency, settings.fxRates);
      totalAed += aed;
      itemCount += 1;
      const status = entry?.status ?? "pending";
      if (isSettled(status)) settledCount += 1;
      if (isPaid(status)) paidAed += aed;
    }

    totalAed += remittanceAed;
    itemCount += remittanceInr > 0 ? 1 : 0;
    if (isSettled(settings.remittanceStatus)) settledCount += remittanceInr > 0 ? 1 : 0;
    if (isPaid(settings.remittanceStatus)) paidAed += remittanceAed;

    return {
      totalAed,
      paidAed,
      pendingAed: totalAed - paidAed,
      settledCount,
      totalCount: itemCount,
    };
  }, [items, entries, settings.fxRates, remittanceAed, remittanceInr, settings.remittanceStatus]);

  const lastMonthTotal = useMemo(() => {
    let total = 0;
    for (const item of items.filter((i) => i.group !== "India")) {
      const prev = getPrevEntry(item.id);
      const amount = prev?.amount ?? item.defaultAmount ?? 0;
      const currency = (prev?.currency ?? item.defaultCurrency) as Currency;
      total += toAed(amount, currency, settings.fxRates);
    }
    const prevIndia = items
      .filter((item) => item.group === "India")
      .reduce((sum, item) => {
        const prev = getPrevEntry(item.id);
        const amount = prev?.amount ?? item.defaultAmount ?? 0;
        const currency = (prev?.currency ?? item.defaultCurrency) as Currency;
        return sum + (currency === "INR" ? amount : toAed(amount, currency, settings.fxRates) * (settings.fxRates.INR ?? 25.2));
      }, 0);
    return total + prevIndia / (settings.fxRates.INR ?? 25.2);
  }, [items, prevEntries, settings.fxRates]);

  const V = getTheme(isDark);
  const btn = { padding: "8px 14px", borderRadius: 10, border: `1px solid ${V.border}`, background: V.card, color: V.text, cursor: "pointer", fontSize: 13, fontWeight: 600 } as const;
  const btnP = { ...btn, background: V.accent, border: "none", color: "#fff", fontWeight: 700 } as const;
  const inp = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${V.border}`, background: V.input, color: V.text, fontSize: 13, outline: "none" } as const;

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: V.bg }}>
        <div style={{ width: 28, height: 28, border: `2.5px solid ${V.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Due <span style={{ color: V.accent, fontStyle: "italic" }}>Tracker</span></div>
          <div style={{ fontSize: 13, color: V.faint, marginTop: 2 }}>Now with actual statuses instead of paid-or-pretend. Roll forward copies last month’s fixed dues into this month and resets them to pending.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => setShowHidden((v) => !v)}>{showHidden ? "Hide hidden" : "Show hidden"}</button>
          <button style={btn} onClick={() => setShowSettings(true)}>⚙ Settings</button>
          <button style={btn} onClick={() => void rollForwardFixedItems()} title="Copies missing fixed dues from last month into this month, with amount, currency and note, but resets status to pending.">↻ Roll forward</button>
          <button style={settings.isLocked ? btnP : btn} onClick={() => void toggleMonthLock(settings.isLocked ? false : true)}>{settings.isLocked ? "🔒 Unlock month" : "🔓 Lock month"}</button>
          <button style={btnP} onClick={() => setShowAddItem(true)}>+ Add due</button>
        </div>
      </div>

      <div style={{ padding: "14px 24px 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => void changeMonth(prevMonth(month))}>‹</button>
        <span style={{ fontSize: 18, fontWeight: 700, minWidth: 180, textAlign: "center" }}>{fmtMonth(month)}</span>
        <button style={btn} onClick={() => void changeMonth(nextMonth(month))}>›</button>
        <button style={{ ...btn, fontSize: 12, padding: "6px 12px" }} onClick={() => void changeMonth(nowMonth())}>Today</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} style={{ ...inp, minWidth: 120 }}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="skipped">Skipped</option>
          <option value="waived">Waived</option>
          <option value="overdue">Overdue</option>
          <option value="upcoming">Upcoming</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} style={{ ...inp, minWidth: 130 }}>
          <option value="manual">Manual</option>
          <option value="dueDay">Due day</option>
          <option value="amountDesc">Amount ↓</option>
          <option value="amountAsc">Amount ↑</option>
          <option value="name">Name</option>
          <option value="status">Status</option>
        </select>
      </div>

      <div style={{ padding: "12px 24px 0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 10 }}>
        {[
          { label: "Total due (AED)", value: `AED ${stats.totalAed.toFixed(0)}`, color: V.accent },
          { label: "Paid", value: `AED ${stats.paidAed.toFixed(0)}`, color: "#16a34a" },
          { label: "Pending", value: `AED ${stats.pendingAed.toFixed(0)}`, color: "#ef4444" },
          { label: "Settled", value: `${stats.settledCount}/${stats.totalCount}`, color: V.muted },
        ].map((card) => (
          <div key={card.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ margin: "10px 24px 0", background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "12px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>vs last month</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: stats.totalAed > lastMonthTotal ? "#ef4444" : stats.totalAed < lastMonthTotal ? "#16a34a" : V.muted }}>
            {stats.totalAed > lastMonthTotal ? "▲" : stats.totalAed < lastMonthTotal ? "▼" : "→"} AED {Math.abs(stats.totalAed - lastMonthTotal).toFixed(0)}
          </span>
          <span style={{ fontSize: 11, color: V.faint }}>Last month: AED {lastMonthTotal.toFixed(0)}</span>
        </div>
      </div>

      {settings.isLocked && (
        <div style={{ margin: "10px 24px 0", padding: "9px 14px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, fontSize: 13 }}>
          🔒 This month is locked. Use Unlock month to edit anything.
        </div>
      )}

      {settings.note && (
        <div style={{ margin: "10px 24px 0", padding: "9px 14px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: 10, fontSize: 13 }}>
          📝 {settings.note}
        </div>
      )}

      <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from(groups.entries()).map(([group, rows]) => {
          const isIndia = group === "India";
          const isCollapsed = collapsedGroups.has(group);
          const allGroupItems = items.filter((item) => item.group === group);
          let groupTotal = 0;
          let groupPaid = 0;

          for (const item of allGroupItems) {
            const entry = getEntry(item.id);
            const amount = effectiveAmount(item, entry);
            const cur = effectiveCurrency(item, entry);
            if (isIndia) {
              const inr = cur === "INR" ? amount : toAed(amount, cur, settings.fxRates) * (settings.fxRates.INR ?? 25.2);
              groupTotal += inr;
              if (isPaid(entry?.status ?? "pending")) groupPaid += inr;
            } else {
              const aed = toAed(amount, cur, settings.fxRates);
              groupTotal += aed;
              if (isPaid(entry?.status ?? "pending")) groupPaid += aed;
            }
          }

          if (!isIndia && group === "UAE") {
            groupTotal += remittanceAed;
            if (isPaid(settings.remittanceStatus)) groupPaid += remittanceAed;
          }

          const currLabel = isIndia ? "INR" : "AED";

          return (
            <div key={group} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden" }}>
              <div onClick={() => toggleGroup(group)} style={{ padding: "11px 16px", borderBottom: isCollapsed ? undefined : `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: V.faint, transition: "transform 0.2s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{group}</span>
                  <span style={{ fontSize: 11, color: V.faint }}>{allGroupItems.length}</span>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: V.muted }} onClick={(e) => e.stopPropagation()}>
                  <span>Total: <strong style={{ color: V.text }}>{currLabel} {groupTotal.toFixed(0)}</strong></span>
                  <span style={{ color: "#16a34a" }}>Paid: <strong>{currLabel} {groupPaid.toFixed(0)}</strong></span>
                  <span style={{ color: "#ef4444" }}>Due: <strong>{currLabel} {(groupTotal - groupPaid).toFixed(0)}</strong></span>
                </div>
              </div>

              {!isCollapsed && !isIndia && group === "UAE" && (
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}`, background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.02)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <select disabled={settings.isLocked} value={settings.remittanceStatus} onChange={(e) => setSettings((p) => ({ ...p, remittanceStatus: e.target.value as Status }))} style={{ ...inp, width: 110, padding: "6px 8px", fontSize: 12 }}>
                      <option value="pending">Pending</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                      <option value="skipped">Skipped</option>
                      <option value="waived">Waived</option>
                    </select>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button onClick={() => router.push("/dashboard/budget/remittance")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 700, color: isPaid(settings.remittanceStatus) || settings.remittanceStatus === "waived" ? V.faint : V.text, textDecoration: isPaid(settings.remittanceStatus) || settings.remittanceStatus === "waived" ? "line-through" : "none" }}>
                          Remittance
                        </button>
                        <select
                          disabled={settings.isLocked}
                          value={settings.remittanceStatus}
                          onChange={(e) => {
                            const nextStatus = e.target.value as Status;
                            setSettings((p) => ({ ...p, remittanceStatus: nextStatus }));
                            void persistMonthSettings({ remittanceStatus: nextStatus });
                          }}
                          style={{
                            ...inp,
                            padding: "4px 8px",
                            fontSize: 11,
                            minWidth: 110,
                            background: statusTone(settings.remittanceStatus).bg,
                            color: statusTone(settings.remittanceStatus).fg,
                            opacity: settings.isLocked ? 0.6 : 1,
                          }}
                        >
                          <option value="pending">Pending</option>
                          <option value="partial">Partial</option>
                          <option value="paid">Paid</option>
                          <option value="skipped">Skipped</option>
                          <option value="waived">Waived</option>
                        </select>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(245,166,35,0.12)", color: V.accent }}>Manual</span>
                      </div>
                      {remittanceEditMode && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <input disabled={settings.isLocked} type="number" style={{ ...inp, width: 120, padding: "5px 8px", fontSize: 12 }} value={settings.remittanceInr ?? ""} onChange={(e) => setSettings((p) => ({ ...p, remittanceInr: parseNum(e.target.value) }))} placeholder="INR amount" />
                          <span style={{ fontSize: 11, color: V.faint }}>÷</span>
                          <input disabled={settings.isLocked} type="number" step="0.01" style={{ ...inp, width: 90, padding: "5px 8px", fontSize: 12 }} value={settings.remittanceRate ?? ""} onChange={(e) => setSettings((p) => ({ ...p, remittanceRate: parseNum(e.target.value) }))} placeholder="Rate" />
                          <span style={{ fontSize: 11, color: V.faint }}>AED {remittanceAed.toFixed(0)}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: V.faint, marginTop: 5 }}>
                        India subtotal: INR {indiaTotalInr.toFixed(0)} · Variance: {remittanceDiffInr === 0 ? "0" : `${remittanceDiffInr > 0 ? "+" : ""}${remittanceDiffInr.toFixed(0)} INR`} ({remittanceDiffAed > 0 ? "+" : ""}AED {remittanceDiffAed.toFixed(0)})
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: remittanceAed > 0 ? V.accent : V.faint, textDecoration: settings.remittanceStatus === "waived" ? "line-through" : "none" }}>AED {remittanceAed.toFixed(0)}</span>
                      <button onClick={() => router.push("/dashboard/budget/remittance")} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.accent }}>History</button>
                      <button disabled={settings.isLocked} onClick={() => void (remittanceEditMode ? saveRemittance() : Promise.resolve(setRemittanceEditMode(true)))} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: remittanceEditMode ? V.accent : V.muted, opacity: settings.isLocked ? 0.6 : 1 }}>{remittanceEditMode ? "Save" : "Edit"}</button>
                    </div>
                  </div>
                </div>
              )}

              {!isCollapsed && rows.map(({ item, entry, amount, currency, diffAbs, diffPct, overdue, upcoming, cycle }) => {
                const status = entry?.status ?? "pending";
                const tone = statusTone(status);
                const isEditing = editItemId === item.id;
                const prev = getPrevEntry(item.id);
                const strike = status === "paid" || status === "waived";

                return (
                  <div key={item.id} style={{ padding: "11px 16px", borderBottom: `1px solid ${V.border}`, opacity: item.isHidden ? 0.45 : 1 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <select disabled={settings.isLocked} value={status} onChange={(e) => void updateEntryStatus(item, e.target.value as Status)} style={{ ...inp, width: 110, padding: "6px 8px", fontSize: 12, opacity: settings.isLocked ? 0.6 : 1 }}>
                        <option value="pending">Pending</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="skipped">Skipped</option>
                        <option value="waived">Waived</option>
                      </select>

                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, textDecoration: strike ? "line-through" : "none", color: strike ? V.faint : V.text }}>{item.name}</span>
                          {item.isFixed && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>Fixed</span>}
                          {item.isHidden && <span style={{ fontSize: 10, color: V.faint }}>(hidden)</span>}
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: tone.bg, color: tone.fg }}>{status}</span>
                          {overdue && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>Overdue</span>}
                          {!overdue && upcoming && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>Upcoming</span>}
                        </div>
                        <div style={{ fontSize: 11, color: V.muted, marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                          {cycle?.statementDate ? <span style={{ fontWeight: 600, color: "#F5A623" }}>Statement: {fmtMonthDay(cycle.statementDate)}</span> : null}
                          {cycle?.dueDate ? <span style={{ fontWeight: 600, color: "#ef4444" }}>Due: {fmtMonthDay(cycle.dueDate)}</span> : null}
                          {cycle?.nextDate && cycle.nextLabel ? (
                            <span style={{ color: cycle.nextLabel === "statement" ? "#F5A623" : "#ef4444" }}>
                              {cycle.daysUntilNext === 0 ? "Today" : `${cycle.daysUntilNext} day${cycle.daysUntilNext === 1 ? "" : "s"}` } for the {cycle.nextLabel === "statement" ? "Statement" : "Due"}: {fmtMonthDay(cycle.nextDate)}
                            </span>
                          ) : null}
                        </div>
                        {isEditing ? (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                            <input defaultValue={entry?.note ?? ""} placeholder="Note for this month…" onBlur={(e) => void updateEntryField(item, "note", e.target.value)} style={{ ...inp, fontSize: 12, boxSizing: "border-box" }} />
                          </div>
                        ) : entry?.note ? (
                          <div style={{ fontSize: 11, color: V.muted, fontStyle: "italic", marginTop: 3 }}>{entry.note}</div>
                        ) : null}
                        {entry && entry.amountPaid > 0 && <div style={{ fontSize: 11, color: status === "paid" ? "#16a34a" : V.accent, marginTop: 3 }}>Paid so far: {currency} {entry.amountPaid.toFixed(2)} · Remaining: {currency} {Math.max((amount ?? 0) - entry.amountPaid, 0).toFixed(2)}{entry.lastPaidAt ? ` · Last payment: ${fmtDateTime(entry.lastPaidAt)}` : ""}</div>}
                        {prev && diffAbs !== null && (
                          <div style={{ fontSize: 11, color: diffAbs === 0 ? V.faint : diffAbs > 0 ? "#ef4444" : "#16a34a", marginTop: 4 }}>
                            vs last month: {diffAbs > 0 ? "+" : ""}{currency} {diffAbs.toFixed(0)}
                            {diffPct !== null ? ` (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%)` : " (new)"}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {isEditing ? (
                          <>
                            <input type="number" defaultValue={amount || ""} placeholder="Amount" onBlur={(e) => void updateEntryField(item, "amount", e.target.value ? Number(e.target.value) : null)} style={{ ...inp, width: 100, textAlign: "right" }} />
                            <select defaultValue={currency} onChange={(e) => void updateEntryField(item, "currency", e.target.value as Currency)} style={{ ...inp, width: 70 }}>
                              <option>AED</option>
                              <option>INR</option>
                              <option>USD</option>
                            </select>
                          </>
                        ) : (
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, textDecoration: status === "waived" ? "line-through" : "none", color: status === "paid" ? "#16a34a" : status === "partial" ? V.accent : status === "waived" ? V.faint : V.text }}>
                              {currency} {amount.toLocaleString()}
                            </div>
                            {entry && entry.amountPaid > 0 && <div style={{ fontSize: 11, color: status === "paid" ? "#16a34a" : V.accent }}>Paid {currency} {entry.amountPaid.toFixed(2)}</div>}
                            {entry && entry.amountPaid > 0 && <div style={{ fontSize: 11, color: V.faint }}>Left {currency} {Math.max((amount ?? 0) - entry.amountPaid, 0).toFixed(2)}</div>}
                            {currency !== "AED" && amount > 0 && <div style={{ fontSize: 11, color: V.faint }}>≈ AED {toAed(amount, currency, settings.fxRates).toFixed(0)}</div>}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        <button onClick={() => void addPaymentToEntry(item)} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: "#16a34a" }}>{entry && entry.amountPaid > 0 ? "Add payment" : "Pay"}</button>
                        <button onClick={() => router.push(`/dashboard/budget/${item.id}`)} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.accent }}>Stats</button>
                        <button onClick={() => setEditItemId(isEditing ? null : item.id)} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: isEditing ? V.accent : V.muted }}>{isEditing ? "Done" : "Edit"}</button>
                        <button onClick={() => void toggleHide(item)} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.faint }}>{item.isHidden ? "Show" : "Hide"}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {showAddItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowAddItem(false)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(520px,100%)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Add due item</div>
              <button style={btn} onClick={() => setShowAddItem(false)}>✕</button>
            </div>
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em", gridColumn: "1/-1" }}>
                Name <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Rent" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Group
                <select style={inp} value={newItem.group} onChange={(e) => setNewItem((p) => ({ ...p, group: e.target.value }))}>
                  {settings.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Currency
                <select style={inp} value={newItem.defaultCurrency} onChange={(e) => setNewItem((p) => ({ ...p, defaultCurrency: e.target.value as Currency }))}>
                  <option>AED</option>
                  <option>INR</option>
                  <option>USD</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Statement day
                <input style={inp} type="number" min="1" max="31" value={newItem.statementDay} onChange={(e) => setNewItem((p) => ({ ...p, statementDay: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Due day
                <input style={inp} type="number" min="1" max="31" value={newItem.dueDay} onChange={(e) => setNewItem((p) => ({ ...p, dueDay: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Default amount
                <input style={inp} type="number" value={newItem.defaultAmount} onChange={(e) => setNewItem((p) => ({ ...p, defaultAmount: e.target.value }))} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: V.text, cursor: "pointer" }}>
                <input type="checkbox" checked={newItem.isFixed} onChange={(e) => setNewItem((p) => ({ ...p, isFixed: e.target.checked }))} />
                Fixed (repeats each month)
              </label>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowAddItem(false)}>Cancel</button>
              <button style={btnP} onClick={() => void addDueItem()}>Add</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowSettings(false)}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, width: "min(560px,100%)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.1em" }}>{fmtMonth(month)}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Month settings</div>
              </div>
              <button style={btn} onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Exchange rates</div>
                {(["INR", "USD"] as const).map((cur) => (
                  <div key={cur} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, width: 40 }}>{cur}:</span>
                    <span style={{ fontSize: 13, color: V.faint }}>1 AED =</span>
                    <input type="number" style={{ ...inp, width: 90 }} value={settings.fxRates[cur] ?? ""} onChange={(e) => setSettings((p) => ({ ...p, fxRates: { ...p.fxRates, [cur]: Number(e.target.value) || 0 } }))} />
                    <span style={{ fontSize: 13, color: V.faint }}>{cur}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Groups</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {settings.groups.map((g) => <span key={g} style={{ padding: "4px 12px", borderRadius: 999, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", fontSize: 12, fontWeight: 600 }}>{g}</span>)}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...inp, flex: 1 }} placeholder="Add new group…" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
                  <button style={btnP} onClick={() => {
                    const v = newGroupName.trim();
                    if (v && !settings.groups.includes(v)) {
                      setSettings((p) => ({ ...p, groups: [...p.groups, v] }));
                      setNewGroupName("");
                    }
                  }}>Add</button>
                </div>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Month note
                <textarea style={{ ...inp, resize: "vertical", minHeight: 70 }} value={settings.note} onChange={(e) => setSettings((p) => ({ ...p, note: e.target.value }))} placeholder="Any notes for this month…" />
              </label>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn} onClick={() => setShowSettings(false)}>Cancel</button>
              <button style={btnP} onClick={() => void saveSettings()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 20, right: 16, background: isDark ? "#1a3a2a" : "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 200 }}>{toast}</div>}
    </div>
  );
}
