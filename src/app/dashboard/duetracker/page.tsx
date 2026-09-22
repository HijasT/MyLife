"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";
import { todayDubai, getUserTimezone, APP_TZ } from "@/lib/timezone";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  type Currency,
  type DueEntry,
  type DueItem,
  type MonthSettings,
  type Status,
  DEFAULT_GROUPS,
  DEFAULT_RATES,
  buildCarryForwardNote,
  dbToEntry,
  dbToItem,
  fmtMonth,
  getCarryForwardAmount,
  getCycleDates,
  getTotalDue,
  isPaid,
  isSettled,
  nextMonth,
  nowMonth,
  prevMonth,
  remittanceGroupFromRow,
  remittanceStatusFromRow,
  toAed,
} from "@/lib/duetracker";
import type { FilterKey, SortKey } from "./types";
import { getTheme, styleKit } from "./_components/theme";
import { Toast } from "./_components/Toast";
import { LoadingSpinner } from "./_components/LoadingSpinner";
import { StatGrid } from "./_components/StatGrid";
import { DueTrackerHeader } from "./_components/DueTrackerHeader";
import { MonthNav } from "./_components/MonthNav";
import { GroupCard } from "./_components/GroupCard";
import { DueRow } from "./_components/DueRow";
import { RemittanceWidget } from "./_components/RemittanceWidget";
import { AddDueModal, type NewDueItemInput } from "./_components/AddDueModal";
import { MonthSettingsModal } from "./_components/MonthSettingsModal";
import { PaymentModal } from "./_components/PaymentModal";

type PaymentModalState = {
  item: DueItem;
  entry: DueEntry;
  remaining: number;
};

export default function DueTrackerPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState(APP_TZ);
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
    remittanceGroup: "India",
  });
  const [showAddItem, setShowAddItem] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("manual");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<number | undefined>(undefined);
  const [isDark, setIsDark] = useState(false);
  const isMobile = useIsMobile();
  const [newGroupName, setNewGroupName] = useState("");
  const [remittanceEditMode, setRemittanceEditMode] = useState(false);
  const [remittanceInrDraft, setRemittanceInrDraft] = useState("");
  const [remittanceRateDraft, setRemittanceRateDraft] = useState("");
  const [fxRateDrafts, setFxRateDrafts] = useState<Record<string, string>>({});
  const [paymentModal, setPaymentModal] = useState<PaymentModalState | null>(null);
  // Tracks which item's payment modal is currently being opened (ensureEntry round-trip
  // in flight) so the row can show visible pending feedback instead of appearing to do
  // nothing while the network request completes.
  const [openingPaymentFor, setOpeningPaymentFor] = useState<string | null>(null);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const tz = await getUserTimezone(supabase, user.id);
      setTimezone(tz);
      let realMonth = nowMonth(tz);

      // If the current real-world month is already locked (fully paid off),
      // open straight into next month instead of a done-and-dusted view.
      const currentLocked = await loadAll(user.id, realMonth);
      if (currentLocked) realMonth = nextMonth(realMonth);

      if (realMonth !== month) {
        setMonth(realMonth);
        setSettings((s) => ({ ...s, month: realMonth }));
      }
      if (currentLocked) await loadAll(user.id, realMonth);

      const created = await autoCreateMonthEntries(user.id, realMonth);
      if (created) await loadAll(user.id, realMonth);
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            remittanceGroup: remittanceGroupFromRow(s),
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
            remittanceGroup: "India",
          },
    );
    markSynced();
    return s?.is_locked ?? false;
  }

  async function changeMonth(next: string) {
    setMonth(next);
    if (userId) {
      await loadAll(userId, next);
      const created = await autoCreateMonthEntries(userId, next);
      if (created) await loadAll(userId, next);
    }
  }

  function getEntry(itemId: string) {
    return entries.find((e) => e.dueItemId === itemId);
  }

  function getPrevEntry(itemId: string) {
    return prevEntries.find((e) => e.dueItemId === itemId);
  }

  function effectiveAmount(item: DueItem, entry?: DueEntry) {
    return getTotalDue(item, entry);
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
    let carryForwardAmount = 0;
    let carriedForwardFrom: string | null = null;
    const prev = getPrevEntry(item.id);
    if (prev) {
      currency = prev.currency;
      carryForwardAmount = getCarryForwardAmount(prev);
      carriedForwardFrom = carryForwardAmount > 0 ? prev.id : null;
      // Base note is "" (not prev.note) — otherwise unrelated freeform notes from the
      // previous month bleed into every future month forever when there's no carry-forward.
      note = buildCarryForwardNote(prevMonth(month), currency, carryForwardAmount, "");
      if (item.isFixed) amount = item.defaultAmount ?? prev.amount;
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
        carry_forward_amount: carryForwardAmount,
        carried_forward_from: carriedForwardFrom,
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

  async function openPaymentModal(item: DueItem) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    setOpeningPaymentFor(item.id);
    try {
      const entry = await ensureEntry(item);
      const totalAmount = getTotalDue(item, entry);
      const remaining = Math.max(totalAmount - (entry.amountPaid ?? 0), 0);
      if (remaining <= 0) {
        showToast("Nothing left to pay");
        return;
      }
      setPaymentModal({ item, entry, remaining });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not open payment form");
    } finally {
      setOpeningPaymentFor(null);
    }
  }

  async function submitPayment(amount: number, note: string) {
    if (!paymentModal || !userId) return;
    const { error } = await supabase.from("due_payments").insert({
      user_id: userId,
      due_entry_id: paymentModal.entry.id,
      paid_amount: amount,
      note: note || null,
    });
    if (error) throw error;
    await refreshEntry(paymentModal.entry.id);
  }

  async function updateEntryStatus(item: DueItem, status: Status) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    if (status === "paid" || status === "partial") {
      await openPaymentModal(item);
      return;
    }
    // Switching an already partial/paid entry back to pending/waived resets its status
    // with no undo in the UI — confirm first, since there's a recorded payment behind it.
    const currentStatus = getEntry(item.id)?.status ?? "pending";
    if (currentStatus === "partial" || currentStatus === "paid") {
      const ok = window.confirm(
        `This due is currently "${currentStatus}" with a payment recorded. Switching to "${status}" will clear that status (the payment history itself is not deleted, just the status/paid summary). Continue?`,
      );
      if (!ok) return;
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
      setEntries((p) => p.map((e) => (e.id === entry.id ? ({ ...e, [field]: value } as DueEntry) : e)));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update entry");
    }
  }

  async function saveSettingsPayload(nextSettings: MonthSettings) {
    if (!userId) return false;
    const payload = {
      user_id: userId,
      month,
      main_currency: nextSettings.mainCurrency,
      note: nextSettings.note,
      cash_in: { ...nextSettings.cashIn, __remittance_status: nextSettings.remittanceStatus, __remittance_group: nextSettings.remittanceGroup },
      fx_rates: nextSettings.fxRates,
      groups: nextSettings.groups,
      remittance_inr: nextSettings.remittanceInr,
      remittance_rate: nextSettings.remittanceRate,
      remittance_paid: nextSettings.remittanceStatus === "paid",
      is_locked: nextSettings.isLocked,
    };
    const { error } = await supabase.from("due_month_settings").upsert(payload, { onConflict: "user_id,month" });
    if (error) {
      showToast(error.message);
      return false;
    }
    return true;
  }

  async function saveSettings() {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    const ok = await saveSettingsPayload(settings);
    if (ok) {
      setShowSettings(false);
      showToast("Settings saved");
    }
  }

  async function saveRemittance() {
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
    const ok = await saveSettingsPayload(settings);
    if (ok) {
      setRemittanceEditMode(false);
      showToast("Remittance saved");
    }
  }

  async function addDueItem(newItem: NewDueItemInput) {
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

  async function updateDueItemField(item: DueItem, field: "name" | "group_name" | "default_currency" | "is_fixed", value: string | boolean) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    const { error } = await supabase.from("due_items").update({ [field]: value }).eq("id", item.id).eq("user_id", userId ?? "");
    if (error) {
      showToast(error.message);
      return;
    }
    const fieldMap: Record<typeof field, keyof DueItem> = {
      name: "name",
      group_name: "group",
      default_currency: "defaultCurrency",
      is_fixed: "isFixed",
    };
    const localField = fieldMap[field];
    setItems((p) => p.map((x) => (x.id === item.id ? ({ ...x, [localField]: value } as DueItem) : x)));
    showToast("Saved");
  }

  async function deleteDueItem(item: DueItem) {
    if (settings.isLocked) {
      showToast("Month is locked");
      return;
    }
    if (!userId) return;
    const ok = window.confirm(`Delete "${item.name}"? This also removes all of its monthly due entries and payment history. This cannot be undone.`);
    if (!ok) return;
    const { error } = await supabase.from("due_items").delete().eq("id", item.id).eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    setItems((p) => p.filter((x) => x.id !== item.id));
    setEntries((p) => p.filter((e) => e.dueItemId !== item.id));
    setPrevEntries((p) => p.filter((e) => e.dueItemId !== item.id));
    if (editItemId === item.id) setEditItemId(null);
    showToast("Due item deleted");
  }

  async function autoCreateMonthEntries(uid: string, m: string) {
    const previous = prevMonth(m);
    const [itemsRes, entriesRes, prevEntriesRes] = await Promise.all([
      supabase.from("due_items").select("*").eq("user_id", uid).order("sort_order").order("created_at"),
      supabase.from("due_entries").select("*").eq("user_id", uid).eq("month", m),
      supabase.from("due_entries").select("*").eq("user_id", uid).eq("month", previous),
    ]);
    if (itemsRes.error || entriesRes.error || prevEntriesRes.error) {
      showToast("Failed to set up this month's due entries — try refreshing");
      return false;
    }

    const allItems = (itemsRes.data ?? []).map(dbToItem);
    const currentEntries = (entriesRes.data ?? []).map(dbToEntry);
    const previousEntries = (prevEntriesRes.data ?? []).map(dbToEntry);

    let created = 0;
    for (const item of allItems) {
      if (currentEntries.some((entry) => entry.dueItemId === item.id)) continue;
      const prev = previousEntries.find((entry) => entry.dueItemId === item.id);
      const carryForwardAmount = getCarryForwardAmount(prev);
      const shouldCreate = item.isFixed || carryForwardAmount > 0;
      if (!shouldCreate) continue;

      const monthlyAmount = item.defaultAmount ?? prev?.amount ?? 0;
      const currency = (prev?.currency ?? item.defaultCurrency) as Currency;
      // Base note is "" (not prev's note) — this is an auto-created entry with no
      // user-entered note yet, so only actual carry-forward lines should persist.
      const note = buildCarryForwardNote(previous, currency, carryForwardAmount, "");
      const { error } = await supabase.from("due_entries").insert({
        user_id: uid,
        due_item_id: item.id,
        month: m,
        amount: monthlyAmount,
        currency,
        status: "pending",
        note,
        carry_forward_amount: carryForwardAmount,
        carried_forward_from: carryForwardAmount > 0 ? prev?.id ?? null : null,
      });
      if (!error) created += 1;
    }
    return created > 0;
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
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }

  async function persistMonthSettings(next: Partial<MonthSettings>) {
    if (!userId) return false;
    const merged = { ...settings, ...next };
    const ok = await saveSettingsPayload(merged);
    if (ok) setSettings(merged);
    return ok;
  }

  async function toggleMonthLock(force?: boolean) {
    if (!userId) return false;
    const nextLocked = typeof force === "boolean" ? force : !settings.isLocked;
    const ok = await persistMonthSettings({ isLocked: nextLocked });
    if (ok) showToast(nextLocked ? "Month locked" : "Month unlocked");
    return ok;
  }

  const visibleItems = useMemo(() => (showHidden ? items : items.filter((item) => !item.isHidden)), [items, showHidden]);

  const remittanceSettled = isSettled(settings.remittanceStatus);

  // Auto-lock must check every item, not just the currently-visible ones —
  // otherwise hiding an unpaid due lets the month lock while it's still owed.
  const allSettled = useMemo(() => {
    const dueSettled = items.every((item) => isSettled(getEntry(item.id)?.status ?? "pending"));
    const needsRemittance = (settings.remittanceInr ?? 0) > 0;
    return dueSettled && (!needsRemittance || remittanceSettled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, entries, settings.remittanceInr, settings.remittanceStatus]);

  // Per-group auto-collapse: once every due in a group is settled (and, for
  // the remittance group, the remittance itself), fold that group away so a
  // fully-paid month visually shrinks down to nothing. Only ever adds groups
  // to the collapsed set — never fights a manual re-expand.
  useEffect(() => {
    if (loading) return;
    const needsRemittance = (settings.remittanceInr ?? 0) > 0;
    const settledGroups = settings.groups.filter((g) => {
      const groupItems = items.filter((item) => item.group === g);
      if (groupItems.length === 0) return false;
      const dueSettled = groupItems.every((item) => isSettled(getEntry(item.id)?.status ?? "pending"));
      const remittanceOk = g !== settings.remittanceGroup || !needsRemittance || remittanceSettled;
      return dueSettled && remittanceOk;
    });
    if (settledGroups.every((g) => collapsedGroups.has(g))) return;
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      for (const g of settledGroups) next.add(g);
      try {
        localStorage.setItem("due_collapsed", JSON.stringify([...next]));
      } catch {}
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, entries, settings.groups, settings.remittanceGroup, settings.remittanceInr, remittanceSettled, loading]);

  useEffect(() => {
    if (!userId || loading) return;
    if (settings.isLocked || !allSettled) return;
    void (async () => {
      const locked = await toggleMonthLock(true);
      if (locked) await changeMonth(nextMonth(month));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSettled, userId, loading, settings.isLocked]);

  const today = todayDubai(timezone);

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
      const overdue = !!cycle?.mostRecentUnsettledDueDate && !(entry && isSettled(entry.status));
      const upcoming = !!cycle?.nextDate && (cycle.daysUntilNext ?? 99) >= 0 && (cycle.daysUntilNext ?? 99) <= 3 && !(entry && isSettled(entry.status));
      return { item, entry, amount, currency, diffAbs, diffPct, overdue, upcoming, cycle };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems, entries, prevEntries, month, today]);

  const filteredSortedItems = useMemo(() => {
    const statusRank: Record<Status, number> = { pending: 0, partial: 1, paid: 2, waived: 3 };
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
    const statusRank: Record<Status, number> = { pending: 0, partial: 1, paid: 2, waived: 3 };
    const map = new Map<string, typeof filteredSortedItems>();
    for (const row of filteredSortedItems) {
      const g = row.item.group || "General";
      if (!map.has(g)) map.set(g, []);
      map.get(g)?.push(row);
    }
    // Within each group, promote pending/partial items above paid/waived ones —
    // a stable secondary sort layered on top of whatever `sortBy` the user picked
    // (filteredSortedItems is already sorted by sortBy, so this only reorders by
    // status, preserving relative order — including manual order — within each status tier).
    for (const [g, rows] of map) {
      map.set(
        g,
        [...rows].sort((a, b) => statusRank[a.entry?.status ?? "pending"] - statusRank[b.entry?.status ?? "pending"]),
      );
    }
    return map;
  }, [filteredSortedItems]);

  const indiaTotalInr = useMemo(() => {
    return items
      .filter((item) => item.group === settings.remittanceGroup)
      .reduce((sum, item) => {
        const entry = getEntry(item.id);
        const amount = effectiveAmount(item, entry);
        const cur = effectiveCurrency(item, entry);
        return sum + (cur === "INR" ? amount : toAed(amount, cur, settings.fxRates) * (settings.fxRates.INR ?? 25.2));
      }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, entries, settings.fxRates, settings.remittanceGroup]);

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

    for (const item of items.filter((i) => i.group !== settings.remittanceGroup)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, entries, settings.fxRates, settings.remittanceGroup, remittanceAed, remittanceInr, settings.remittanceStatus]);

  const lastMonthTotal = useMemo(() => {
    let total = 0;
    for (const item of items.filter((i) => i.group !== settings.remittanceGroup)) {
      const prev = getPrevEntry(item.id);
      const amount = prev?.amount ?? item.defaultAmount ?? 0;
      const currency = (prev?.currency ?? item.defaultCurrency) as Currency;
      total += toAed(amount, currency, settings.fxRates);
    }
    const prevIndia = items
      .filter((item) => item.group === settings.remittanceGroup)
      .reduce((sum, item) => {
        const prev = getPrevEntry(item.id);
        const amount = prev?.amount ?? item.defaultAmount ?? 0;
        const currency = (prev?.currency ?? item.defaultCurrency) as Currency;
        return sum + (currency === "INR" ? amount : toAed(amount, currency, settings.fxRates) * (settings.fxRates.INR ?? 25.2));
      }, 0);
    return total + prevIndia / (settings.fxRates.INR ?? 25.2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, prevEntries, settings.fxRates, settings.remittanceGroup]);

  const V = getTheme(isDark);
  const { shadow, btn, btnP, inp } = styleKit(V, isDark, isMobile);

  if (loading) {
    return <LoadingSpinner bg={V.bg} accent={V.accent} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <style>{`@keyframes duetracker-spin{to{transform:rotate(360deg)}}`}</style>

      <DueTrackerHeader
        V={V}
        btn={btn}
        btnP={btnP}
        monthLabel={fmtMonth(month)}
        isLocked={settings.isLocked}
        showHidden={showHidden}
        onToggleLock={() => void toggleMonthLock()}
        onToggleShowHidden={() => setShowHidden((v) => !v)}
        onOpenSettings={() => {
          setFxRateDrafts(Object.fromEntries(Object.entries(settings.fxRates).map(([k, v]) => [k, String(v)])));
          setShowSettings(true);
        }}
        onOpenAddItem={() => setShowAddItem(true)}
      />

      <MonthNav
        V={V}
        btn={btn}
        inp={inp}
        monthLabel={fmtMonth(month)}
        filter={filter}
        sortBy={sortBy}
        onPrev={() => void changeMonth(prevMonth(month))}
        onNext={() => void changeMonth(nextMonth(month))}
        onToday={() => void changeMonth(nowMonth(timezone))}
        onFilterChange={setFilter}
        onSortChange={setSortBy}
      />

      <div style={{ padding: "14px 24px 0" }}>
        <StatGrid
          V={V}
          shadow={shadow}
          cards={[
            { label: "Total due (AED)", value: `AED ${stats.totalAed.toFixed(0)}` },
            { label: "Paid", value: `AED ${stats.paidAed.toFixed(0)}`, color: V.pos },
            { label: "Pending", value: `AED ${stats.pendingAed.toFixed(0)}`, color: V.accent },
            {
              label: "Settled",
              value: (
                <>
                  {stats.settledCount}/{stats.totalCount}
                  <div style={{ marginTop: 8, height: 5, background: V.input, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${stats.totalCount > 0 ? Math.round((stats.settledCount / stats.totalCount) * 100) : 0}%`, height: "100%", background: V.accent }} />
                  </div>
                </>
              ),
              color: V.muted,
            },
          ]}
        />
      </div>

      <div style={{ margin: "12px 24px 0", background: V.input, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>vs last month</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: stats.totalAed > lastMonthTotal ? V.neg : stats.totalAed < lastMonthTotal ? V.pos : V.muted }}>
          {stats.totalAed > lastMonthTotal ? "AED " + Math.abs(stats.totalAed - lastMonthTotal).toFixed(0) + " higher" : stats.totalAed < lastMonthTotal ? "AED " + Math.abs(stats.totalAed - lastMonthTotal).toFixed(0) + " lower" : "No change"}
          <span style={{ fontSize: 12, color: V.faint, fontWeight: 400 }}> · was AED {lastMonthTotal.toFixed(0)}</span>
        </span>
      </div>

      {settings.isLocked && (
        <div style={{ margin: "12px 24px 0", padding: "10px 14px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, fontSize: 13, color: V.text }}>
          This month is locked. Use Unlock month to edit anything.
        </div>
      )}

      {settings.note && (
        <div style={{ margin: "12px 24px 0", padding: "10px 14px", background: V.accentSoft, border: `1px solid ${V.accent}33`, borderRadius: 10, fontSize: 13, color: V.text }}>{settings.note}</div>
      )}

      <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from(groups.entries()).map(([group, rows]) => {
          const isIndia = group === settings.remittanceGroup;
          // The remittance widget renders under whichever group ISN'T the remittance-tracked
          // one — i.e. the "home" group sending money to the remittance-tracked group.
          const nonRemittanceGroup = settings.groups.find((g) => g !== settings.remittanceGroup) ?? settings.groups[0];
          const isCollapsed = collapsedGroups.has(group);
          const allGroupItems = items.filter((item) => item.group === group);
          let groupTotal = 0;
          let groupPaid = 0;
          let groupWaived = 0;

          for (const item of allGroupItems) {
            const entry = getEntry(item.id);
            const totalDue = effectiveAmount(item, entry);
            const cur = effectiveCurrency(item, entry);
            const paidPortion = Math.max(entry?.amountPaid ?? 0, 0);
            const totalValue = isIndia ? (cur === "INR" ? totalDue : toAed(totalDue, cur, settings.fxRates) * (settings.fxRates.INR ?? 25.2)) : toAed(totalDue, cur, settings.fxRates);
            const paidValue = isIndia ? (cur === "INR" ? paidPortion : toAed(paidPortion, cur, settings.fxRates) * (settings.fxRates.INR ?? 25.2)) : toAed(paidPortion, cur, settings.fxRates);

            groupTotal += totalValue;
            groupPaid += paidValue;
            if ((entry?.status ?? "pending") === "waived") groupWaived += totalValue;
          }

          if (!isIndia && group === nonRemittanceGroup) {
            groupTotal += remittanceAed;
            if (settings.remittanceStatus === "waived") groupWaived += remittanceAed;
            else if (settings.remittanceStatus === "paid" || settings.remittanceStatus === "partial") groupPaid += remittanceAed;
          }

          const groupDue = groupTotal - groupPaid - groupWaived;
          const currLabel = isIndia ? "INR" : "AED";
          const showRemittance = !isIndia && group === nonRemittanceGroup;

          return (
            <GroupCard
              key={group}
              V={V}
              shadow={shadow}
              isDark={isDark}
              isMobile={isMobile}
              group={group}
              itemCount={allGroupItems.length}
              isCollapsed={isCollapsed}
              onToggleCollapse={() => toggleGroup(group)}
              currLabel={currLabel}
              total={groupTotal}
              paid={groupPaid}
              waived={groupWaived}
              due={groupDue}
              remittanceSlot={
                showRemittance ? (
                  <RemittanceWidget
                    V={V}
                    inp={inp}
                    btn={btn}
                    isDark={isDark}
                    isLocked={settings.isLocked}
                    status={settings.remittanceStatus}
                    editMode={remittanceEditMode}
                    inrDraft={remittanceInrDraft}
                    rateDraft={remittanceRateDraft}
                    remittanceAed={remittanceAed}
                    indiaTotalInr={indiaTotalInr}
                    diffInr={remittanceDiffInr}
                    diffAed={remittanceDiffAed}
                    onStatusChange={(nextStatus) => {
                      setSettings((p) => ({ ...p, remittanceStatus: nextStatus }));
                      void persistMonthSettings({ remittanceStatus: nextStatus });
                    }}
                    onInrDraftChange={(value) => {
                      setRemittanceInrDraft(value);
                      setSettings((p) => ({ ...p, remittanceInr: value === "" ? null : Number(value) }));
                    }}
                    onRateDraftChange={(value) => {
                      setRemittanceRateDraft(value);
                      setSettings((p) => ({ ...p, remittanceRate: value === "" ? null : Number(value) }));
                    }}
                    onEditOrSave={() => {
                      if (remittanceEditMode) {
                        void saveRemittance();
                        return;
                      }
                      setRemittanceInrDraft(settings.remittanceInr != null ? String(settings.remittanceInr) : "");
                      setRemittanceRateDraft(settings.remittanceRate != null ? String(settings.remittanceRate) : "");
                      setRemittanceEditMode(true);
                    }}
                    onViewHistory={() => router.push("/dashboard/duetracker/remittance")}
                  />
                ) : undefined
              }
            >
              {rows.map(({ item, entry, amount, currency, diffAbs, diffPct, overdue, upcoming, cycle }) => (
                <DueRow
                  key={item.id}
                  V={V}
                  btn={btn}
                  inp={inp}
                  isDark={isDark}
                  isMobile={isMobile}
                  isLocked={settings.isLocked}
                  groups={settings.groups}
                  item={item}
                  entry={entry}
                  amount={amount}
                  currency={currency}
                  diffAbs={diffAbs}
                  diffPct={diffPct}
                  overdue={overdue}
                  upcoming={upcoming}
                  cycle={cycle}
                  isEditing={editItemId === item.id}
                  isOpeningPayment={openingPaymentFor === item.id}
                  fxRates={settings.fxRates}
                  onStatusChange={(status) => void updateEntryStatus(item, status)}
                  onOpenPayment={() => void openPaymentModal(item)}
                  onViewStats={() => router.push(`/dashboard/duetracker/${item.id}`)}
                  onToggleEdit={() => setEditItemId(editItemId === item.id ? null : item.id)}
                  onToggleHide={() => void toggleHide(item)}
                  onUpdateEntryField={(field, value) => void updateEntryField(item, field, value)}
                  onUpdateItemField={(field, value) => void updateDueItemField(item, field, value)}
                  onDeleteItem={() => void deleteDueItem(item)}
                />
              ))}
            </GroupCard>
          );
        })}
      </div>

      {showAddItem && (
        <AddDueModal V={V} btn={btn} btnP={btnP} inp={inp} isMobile={isMobile} groups={settings.groups} onClose={() => setShowAddItem(false)} onSubmit={(item) => void addDueItem(item)} />
      )}

      {showSettings && (
        <MonthSettingsModal
          V={V}
          btn={btn}
          btnP={btnP}
          inp={inp}
          isDark={isDark}
          month={month}
          settings={settings}
          fxRateDrafts={fxRateDrafts}
          newGroupName={newGroupName}
          onClose={() => setShowSettings(false)}
          onSave={() => void saveSettings()}
          onFxDraftChange={(cur, value) => {
            setFxRateDrafts((d) => ({ ...d, [cur]: value }));
            setSettings((p) => ({ ...p, fxRates: { ...p.fxRates, [cur]: Number(value) || 0 } }));
          }}
          onNewGroupNameChange={setNewGroupName}
          onAddGroup={() => {
            const v = newGroupName.trim();
            if (v && !settings.groups.includes(v)) {
              setSettings((p) => ({ ...p, groups: [...p.groups, v] }));
              setNewGroupName("");
            }
          }}
          onRemittanceGroupChange={(g) => setSettings((p) => ({ ...p, remittanceGroup: g }))}
          onNoteChange={(note) => setSettings((p) => ({ ...p, note }))}
        />
      )}

      {paymentModal && (
        <PaymentModal
          V={V}
          btn={btn}
          btnP={btnP}
          inp={inp}
          itemName={paymentModal.item.name}
          monthLabel={fmtMonth(month)}
          currency={paymentModal.entry.currency}
          totalDue={getTotalDue(paymentModal.item, paymentModal.entry)}
          amountPaid={paymentModal.entry.amountPaid ?? 0}
          remaining={paymentModal.remaining}
          onClose={() => setPaymentModal(null)}
          onSubmit={submitPayment}
          onSaved={(msg) => {
            showToast(msg);
            setPaymentModal(null);
          }}
          onError={showToast}
        />
      )}

      <Toast message={toast} isDark={isDark} pos={V.pos} />
    </div>
  );
}
