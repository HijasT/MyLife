"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getUserTimezone, APP_TZ } from "@/lib/timezone";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  type Currency,
  type DueEntry,
  type DueItem,
  type DuePayment,
  type Status,
  addMonths,
  buildCarryForwardNote,
  dbToEntry,
  dbToItem,
  dbToPayment,
  fmtMonth,
  getCarryForwardAmount,
  getEntryRemaining,
  getTotalDue,
  nowMonth,
  pctDiff,
  toAed,
} from "@/lib/duetracker";
import { getTheme, styleKit } from "../_components/theme";
import { Toast } from "../_components/Toast";
import { LoadingSpinner } from "../_components/LoadingSpinner";
import { PageHeader } from "../_components/PageHeader";
import { StatGrid } from "../_components/StatGrid";
import { PaymentModal } from "../_components/PaymentModal";
import { TrendChart } from "../_components/TrendChart";
import { EntryRow } from "../_components/EntryRow";
import { AddMonthModal } from "../_components/AddMonthModal";
import { ItemDetailsCard } from "../_components/ItemDetailsCard";

type DueItemNav = { id: string; name: string };

export default function DueItemDetailPage() {
  const params = useParams();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(APP_TZ);
  const [item, setItem] = useState<DueItem | null>(null);
  const [itemNav, setItemNav] = useState<DueItemNav[]>([]);
  const [entries, setEntries] = useState<DueEntry[]>([]);
  const [paymentsByEntry, setPaymentsByEntry] = useState<Record<string, DuePayment[]>>({});
  const [fxByMonth, setFxByMonth] = useState<Record<string, Record<string, number>>>({});
  const [monthLocks, setMonthLocks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<number | undefined>(undefined);
  const [isDark, setIsDark] = useState(false);
  const isMobile = useIsMobile();

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
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editItemCurrency, setEditItemCurrency] = useState<Currency>("AED");
  const [editIsFixed, setEditIsFixed] = useState(false);
  const [paymentModalEntry, setPaymentModalEntry] = useState<DueEntry | null>(null);

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
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }
        setUserId(user.id);

        const tz = await getUserTimezone(supabase, user.id);
        setTimezone(tz);
        setNewMonth(nowMonth(tz));

        const itemId = Array.isArray(params.id) ? params.id[0] : params.id;
        if (!itemId) {
          setLoading(false);
          return;
        }

        const [itemRes, entriesRes, settingsRes, navRes] = await Promise.all([
          supabase.from("due_items").select("*").eq("id", itemId).eq("user_id", user.id).single(),
          supabase.from("due_entries").select("*").eq("due_item_id", itemId).eq("user_id", user.id).order("month", { ascending: false }),
          supabase.from("due_month_settings").select("month,fx_rates,is_locked").eq("user_id", user.id),
          supabase.from("due_items").select("id,name,sort_order,created_at").eq("user_id", user.id).order("sort_order").order("created_at"),
        ]);

        if (itemRes.error) {
          showToast("Failed to load this due item");
        }

        if (itemRes.data) {
          const nextItem = dbToItem(itemRes.data);
          setItem(nextItem);
          setEditStatDay(nextItem.statementDay?.toString() ?? "");
          setEditDueDay(nextItem.dueDay?.toString() ?? "");
          setEditName(nextItem.name);
          setEditGroup(nextItem.group);
          setEditItemCurrency(nextItem.defaultCurrency);
          setEditIsFixed(nextItem.isFixed);
        }

        if (entriesRes.data) {
          setEntries(entriesRes.data.map(dbToEntry));

          const entryIds = entriesRes.data.map((e: { id: string }) => e.id);
          if (entryIds.length > 0) {
            const paymentsRes = await supabase.from("due_payments").select("*").in("due_entry_id", entryIds).eq("user_id", user.id).order("paid_at", { ascending: false });

            if (paymentsRes.data) {
              const grouped: Record<string, DuePayment[]> = {};
              for (const row of paymentsRes.data) {
                const payment = dbToPayment(row);
                if (!grouped[payment.dueEntryId]) grouped[payment.dueEntryId] = [];
                grouped[payment.dueEntryId].push(payment);
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
      } catch {
        showToast("Failed to load this due item");
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, router, supabase]);

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2500);
  }

  async function refreshEntry(entryId: string) {
    const [entryRes, paymentsRes] = await Promise.all([
      supabase.from("due_entries").select("*").eq("id", entryId).maybeSingle(),
      supabase.from("due_payments").select("*").eq("due_entry_id", entryId).eq("user_id", userId ?? "").order("paid_at", { ascending: false }),
    ]);

    if (entryRes.error || !entryRes.data) {
      throw new Error(entryRes.error?.message ?? "Could not refresh due entry");
    }

    const refreshed = dbToEntry(entryRes.data);
    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? refreshed : entry)));
    setPaymentsByEntry((prev) => ({
      ...prev,
      [entryId]: (paymentsRes.data ?? []).map(dbToPayment),
    }));
    return refreshed;
  }

  function openPaymentModal(entry: DueEntry) {
    if (monthLocks[entry.month]) {
      showToast("That month is locked");
      return;
    }
    const remaining = Math.max(getEntryRemaining({ defaultAmount: null }, entry), 0);
    if (remaining <= 0) {
      showToast("Nothing left to pay");
      return;
    }
    setPaymentModalEntry(entry);
  }

  async function submitPayment(amount: number, note: string) {
    if (!paymentModalEntry || !userId) return;
    const { error } = await supabase.from("due_payments").insert({
      user_id: userId,
      due_entry_id: paymentModalEntry.id,
      paid_amount: amount,
      note: note || null,
    });
    if (error) throw error;
    await refreshEntry(paymentModalEntry.id);
  }

  async function deletePayment(paymentId: string, entryId: string) {
    if (!userId) return;
    if (!confirm("Delete this payment? The entry status and remaining amount will be recalculated.")) return;
    const { error } = await supabase.from("due_payments").delete().eq("id", paymentId).eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    await refreshEntry(entryId);
    showToast("Payment deleted");
  }

  async function saveDates() {
    if (!item || !userId) return;
    const statement = editStatDay ? Number(editStatDay) : null;
    const due = editDueDay ? Number(editDueDay) : null;
    const name = editName.trim() || item.name;
    const group = editGroup.trim() || item.group;
    const { error } = await supabase
      .from("due_items")
      .update({
        statement_date: statement,
        due_date_day: due,
        name,
        group_name: group,
        default_currency: editItemCurrency,
        is_fixed: editIsFixed,
      })
      .eq("id", item.id)
      .eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    setItem((p) => (p ? { ...p, statementDay: statement, dueDay: due, name, group, defaultCurrency: editItemCurrency, isFixed: editIsFixed } : p));
    setEditName(name);
    setEditGroup(group);
    setEditingDates(false);
    showToast("Saved");
  }

  async function deleteItem() {
    if (!item || !userId) return;
    const ok = window.confirm(`Delete "${item.name}"? This also removes all of its monthly due entries and payment history. This cannot be undone.`);
    if (!ok) return;
    const { error } = await supabase.from("due_items").delete().eq("id", item.id).eq("user_id", userId);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Due item deleted");
    router.push("/dashboard/duetracker");
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
    const { error } = await supabase.from("due_entries").update({ amount, currency: editCurrency, note: editNote, status: editStatus, paid_at: null }).eq("id", entry.id).eq("user_id", userId);
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

    const { data, error } = await supabase
      .from("due_entries")
      .insert({
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
      })
      .select("*")
      .single();
    if (error || !data) {
      showToast(error?.message ?? "Could not add month");
      return;
    }
    const entry = dbToEntry(data);
    setEntries((p) => [entry, ...p].sort((a, b) => b.month.localeCompare(a.month)));
    setShowAddMonth(false);
    setNewMonth(nowMonth());
    setNewAmount("");
    setNewNote("");
    setNewStatus("pending");
    showToast(carryForwardAmount > 0 ? "Month added with carry forward" : "Month added");
  }

  async function updateStatus(entry: DueEntry, status: Status) {
    if (monthLocks[entry.month]) {
      showToast("That month is locked");
      return;
    }
    if (!userId) return;
    if (status === "paid" || status === "partial") {
      openPaymentModal(entry);
      return;
    }
    // Switching an already partial/paid entry back to pending/waived resets its status
    // with no undo in the UI — confirm first, since there's a recorded payment behind it.
    if (entry.status === "partial" || entry.status === "paid") {
      const ok = window.confirm(
        `This month is currently "${entry.status}" with a payment recorded. Switching to "${status}" will clear that status (the payment history itself is not deleted, just the status/paid summary). Continue?`,
      );
      if (!ok) return;
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
    const settled = entries.filter((e) => e.status === "paid" || e.status === "waived");
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

  const V = getTheme(isDark);
  const { shadow, btn, btnP, inp } = styleKit(V, isDark, isMobile);

  if (loading) return <LoadingSpinner bg={V.bg} accent={V.accent} />;
  if (!item)
    return (
      <div style={{ padding: 40, background: V.bg, minHeight: "100vh", color: V.muted }}>
        Not found.{" "}
        <Link href="/dashboard/duetracker" style={{ color: V.accent }}>
          Back
        </Link>
      </div>
    );

  const carryForwardPreview = (() => {
    const previousMonth = addMonths(newMonth, -1);
    const previousEntry = entries.find((e) => e.month === previousMonth);
    const carryForwardAmount = getCarryForwardAmount(previousEntry);
    const baseAmount = newAmount === "" ? (item.defaultAmount ?? 0) : Number(newAmount || 0);
    return { previousMonth, carryForwardAmount, baseAmount };
  })();

  return (
    <div style={{ minHeight: "100vh", background: V.bg, color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <style>{`@keyframes duetracker-spin{to{transform:rotate(360deg)}}`}</style>
      <PageHeader
        V={V}
        isDark={isDark}
        title=""
        right={
          <>
            <button style={{ ...btn, opacity: nav.prev ? 1 : 0.45, cursor: nav.prev ? "pointer" : "not-allowed" }} disabled={!nav.prev} onClick={() => nav.prev && router.push(`/dashboard/duetracker/${nav.prev.id}`)} title={nav.prev ? `Previous: ${nav.prev.name}` : "No previous due"} aria-label={nav.prev ? `Previous: ${nav.prev.name}` : "No previous due"}>
              ‹
            </button>
            <button style={{ ...btn, opacity: nav.next ? 1 : 0.45, cursor: nav.next ? "pointer" : "not-allowed" }} disabled={!nav.next} onClick={() => nav.next && router.push(`/dashboard/duetracker/${nav.next.id}`)} title={nav.next ? `Next: ${nav.next.name}` : "No next due"} aria-label={nav.next ? `Next: ${nav.next.name}` : "No next due"}>
              ›
            </button>
            <button
              style={btnP}
              onClick={() => {
                setNewCurrency(item.defaultCurrency);
                setShowAddMonth(true);
              }}
            >
              + Add month
            </button>
          </>
        }
      />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        <ItemDetailsCard
          V={V}
          btn={btn}
          btnP={btnP}
          inp={inp}
          item={item}
          editingDates={editingDates}
          editName={editName}
          editGroup={editGroup}
          editItemCurrency={editItemCurrency}
          editIsFixed={editIsFixed}
          editStatDay={editStatDay}
          editDueDay={editDueDay}
          onEditingDatesToggle={setEditingDates}
          onEditNameChange={setEditName}
          onEditGroupChange={setEditGroup}
          onEditItemCurrencyChange={setEditItemCurrency}
          onEditIsFixedChange={setEditIsFixed}
          onEditStatDayChange={setEditStatDay}
          onEditDueDayChange={setEditDueDay}
          onSave={() => void saveDates()}
          onDelete={() => void deleteItem()}
        />

        {stats && (
          <div style={{ marginBottom: 20 }}>
            <StatGrid
              V={V}
              shadow={shadow}
              cards={[
                { label: `Total paid (${nativeCurrency})`, value: `${nativeCurrency} ${stats.totalNative.toFixed(0)}`, color: V.accent },
                { label: "Months paid", value: stats.paidCount, color: V.pos },
                { label: "Settled", value: stats.settledCount, color: V.muted },
                { label: "Waived", value: stats.waived, color: V.faint },
              ]}
            />
          </div>
        )}

        {chart.points.length > 0 && (
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "11px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: V.faint, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>Recent trend</div>
            <TrendChart V={V} nativeCurrency={nativeCurrency} avg={chart.avg} avgPct={chart.avgPct} points={chart.points} />
          </div>
        )}

        {stats && stats.missing.length > 0 && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>
                Missing {stats.missing.length} month{stats.missing.length > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 11, color: V.faint, marginTop: 2 }}>
                {stats.missing.slice(0, 4).map(fmtMonth).join(", ")}
                {stats.missing.length > 4 ? ` +${stats.missing.length - 4} more` : ""}
              </div>
            </div>
            <button
              style={{ ...btnP, background: "#ef4444" }}
              onClick={() => {
                setNewCurrency(item.defaultCurrency);
                setNewMonth(stats.missing[0]);
                setShowAddMonth(true);
              }}
            >
              Add missing
            </button>
          </div>
        )}

        <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: V.faint, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
            All months ({entries.length})
          </div>
          {entries.length === 0 && <div style={{ padding: "24px 16px", textAlign: "center", color: V.faint, fontSize: 13 }}>No records yet. Humans keep inventing bills though, so it won&rsquo;t stay empty.</div>}
          {entries.map((entry, index) => {
            const prev = index < entries.length - 1 ? entries[index + 1] : null;
            const aed = toAed(entry.amount ?? 0, entry.currency, fxByMonth[entry.month] ?? { INR: 25.2, USD: 3.67 });
            const diffAbs = prev ? (entry.amount ?? 0) - (prev.amount ?? 0) : null;
            const diffPct = prev ? pctDiff(prev.amount ?? 0, entry.amount ?? 0) : null;
            return (
              <EntryRow
                key={entry.id}
                V={V}
                btn={btn}
                inp={inp}
                isDark={isDark}
                isMobile={isMobile}
                entry={entry}
                diffAbs={diffAbs}
                diffPct={diffPct}
                aed={aed}
                timezone={timezone}
                isLocked={!!monthLocks[entry.month]}
                isEditing={editingMonth === entry.month}
                editAmount={editAmount}
                editCurrency={editCurrency}
                editNote={editNote}
                editStatus={editStatus}
                payments={paymentsByEntry[entry.id] ?? []}
                onStartEdit={() => startEdit(entry)}
                onCancelEdit={() => setEditingMonth(null)}
                onSaveEdit={() => void saveEdit(entry)}
                onEditAmountChange={setEditAmount}
                onEditCurrencyChange={setEditCurrency}
                onEditNoteChange={setEditNote}
                onEditStatusChange={setEditStatus}
                onStatusChange={(status) => void updateStatus(entry, status)}
                onOpenPayment={() => openPaymentModal(entry)}
                onDeletePayment={(paymentId) => void deletePayment(paymentId, entry.id)}
              />
            );
          })}
        </div>
      </div>

      {paymentModalEntry && (
        <PaymentModal
          V={V}
          btn={btn}
          btnP={btnP}
          inp={inp}
          itemName={item.name}
          monthLabel={fmtMonth(paymentModalEntry.month)}
          currency={paymentModalEntry.currency}
          totalDue={getTotalDue({ defaultAmount: null }, paymentModalEntry)}
          amountPaid={paymentModalEntry.amountPaid ?? 0}
          remaining={getEntryRemaining({ defaultAmount: null }, paymentModalEntry)}
          onClose={() => setPaymentModalEntry(null)}
          onSubmit={submitPayment}
          onSaved={(msg) => {
            showToast(msg);
            setPaymentModalEntry(null);
          }}
          onError={showToast}
        />
      )}

      {showAddMonth && (
        <AddMonthModal
          V={V}
          btn={btn}
          btnP={btnP}
          inp={inp}
          defaultAmount={item.defaultAmount ?? 0}
          newMonth={newMonth}
          newAmount={newAmount}
          newCurrency={newCurrency}
          newNote={newNote}
          newStatus={newStatus}
          carryForwardPreview={carryForwardPreview}
          missing={stats?.missing ?? []}
          onClose={() => setShowAddMonth(false)}
          onSave={() => void addMissingMonth()}
          onMonthChange={setNewMonth}
          onAmountChange={setNewAmount}
          onCurrencyChange={setNewCurrency}
          onNoteChange={setNewNote}
          onStatusChange={setNewStatus}
        />
      )}

      <Toast message={toast} isDark={isDark} pos={V.pos} />
    </div>
  );
}
