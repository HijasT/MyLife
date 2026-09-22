/**
 * Shared Due Tracker types, pure calculations, and DB row mappers —
 * previously duplicated verbatim across page.tsx, [id]/page.tsx, and
 * remittance/page.tsx, with no way to keep them in sync if one changed
 * (the exact kind of drift that took several commits to fix for carry-forward
 * math and cycle-date/overdue detection). Every function here is behavior-frozen
 * from the original three files — this module is pure consolidation, not a
 * rewrite of the logic itself.
 */

import { nowDubai, APP_TZ } from "@/lib/timezone";

export type Currency = "AED" | "INR" | "USD";
export type Status = "pending" | "partial" | "paid" | "waived";

export type DueItem = {
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

export type DueEntry = {
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
  carryForwardAmount: number;
  carriedForwardFrom: string | null;
};

export type DuePayment = {
  id: string;
  dueEntryId: string;
  paidAmount: number;
  paidAt: string;
  note: string;
};

export type MonthSettings = {
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
  // Which group is treated as the remittance-tracked destination (defaults to "India"
  // for backward compatibility). User-editable since groups are free-form/renamable.
  remittanceGroup: string;
};

export const DEFAULT_GROUPS = ["UAE", "India"];
export const DEFAULT_RATES: Record<string, number> = { INR: 25.2, USD: 3.67 };

// Distinct from the module's red accent — flags the remaining/outstanding amount
// specifically on a "partial" entry, so it reads differently from a plain pending due.
export const PARTIAL_REMAINING_COLOR = "var(--warning)";

export function nowMonth(tz: string = APP_TZ) {
  return nowDubai(tz).slice(0, 7);
}

export function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AE", {
    month: "long",
    year: "numeric",
  });
}

export function fmtMonthShort(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AE", { month: "short" });
}

export function fmtDateTime(iso: string | null, tz: string = APP_TZ) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function daysBetween(fromDate: Date, toDate: Date) {
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function monthDayDate(baseMonth: string, day: number) {
  const [y, mo] = baseMonth.split("-").map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return new Date(y, mo - 1, Math.min(day, lastDay));
}

export function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function fmtMonthDay(date: Date) {
  return date.toLocaleDateString("en-AE", { month: "short", day: "numeric" });
}

export function getCycleDates(statementDay: number | null, dueDay: number | null, todayIso: string, status?: Status) {
  if (!statementDay && !dueDay) return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const thisMonth = todayIso.slice(0, 7);
  const prev = prevMonth(thisMonth);
  const next = nextMonth(thisMonth);

  const buildPair = (statementMonth: string) => {
    const statementDate = statementDay ? monthDayDate(statementMonth, statementDay) : null;
    let dueDate: Date | null = null;
    if (dueDay) {
      // No statement day at all: the due day is just a same-month recurring date,
      // there's no statement/due cycle to span a month boundary with.
      // With a statement day: due falls in the same month if it's after the statement
      // day within that month, otherwise it spans into the next month.
      const dueMonth = !statementDay ? statementMonth : statementDay < dueDay ? statementMonth : nextMonth(statementMonth);
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

  // Overdue determination independent of the "what to show next" rolling logic above:
  // the most recent cycle (previous or current month's) whose due date has actually
  // passed relative to today. `active`/`nextPair` roll forward once the current cycle's
  // due date has passed, so they can never be used to detect overdue — this looks at
  // previousPair/currentPair directly instead.
  const pastDueDates = [previousPair.dueDate, currentPair.dueDate].filter(
    (d): d is Date => !!d && d < today,
  );
  const mostRecentUnsettledDueDate =
    pastDueDates.length > 0 ? pastDueDates.reduce((a, b) => (a > b ? a : b)) : null;

  return {
    statementDate: active.statementDate,
    dueDate: active.dueDate,
    nextLabel,
    nextDate,
    daysUntilNext: nextDate ? daysBetween(today, nextDate) : null,
    previousStatementDate: previousPair.statementDate,
    previousDueDate: previousPair.dueDate,
    mostRecentUnsettledDueDate,
  };
}

export function toAed(amount: number, currency: Currency | string, rates: Record<string, number>) {
  if (currency === "AED") return amount;
  const rate = rates[currency];
  return rate ? amount / rate : amount;
}

export function isSettled(status: Status) {
  return status === "paid" || status === "waived";
}

export function isPaid(status: Status) {
  return status === "paid";
}

export function statusTone(status: Status) {
  if (status === "paid") return { bg: "rgba(22,163,74,0.12)", fg: "var(--positive)" };
  if (status === "partial") return { bg: "rgba(239,68,68,0.14)", fg: "var(--negative)" };
  if (status === "waived") return { bg: "rgba(148,163,184,0.16)", fg: "#94a3b8" };
  return { bg: "rgba(239,68,68,0.08)", fg: "var(--negative)" };
}

export function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pctDiff(prev: number | null, current: number) {
  if (!prev || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

export function getMonthlyAmount(item: { defaultAmount: number | null }, entry?: { amount: number | null }) {
  return entry?.amount ?? item.defaultAmount ?? 0;
}

export function getTotalDue(item: { defaultAmount: number | null }, entry?: { amount: number | null; carryForwardAmount: number }) {
  return getMonthlyAmount(item, entry) + (entry?.carryForwardAmount ?? 0);
}

export function getEntryRemaining(item: { defaultAmount: number | null }, entry?: { amount: number | null; carryForwardAmount: number; amountPaid: number } | null) {
  if (!entry) return 0;
  return getTotalDue(item, entry) - (entry.amountPaid ?? 0);
}

export function getCarryForwardAmount(entry?: { amount: number | null; carryForwardAmount: number; amountPaid: number; status: Status } | null) {
  if (!entry) return 0;
  if (entry.status === "waived") return 0;
  return (entry.amount ?? 0) + (entry.carryForwardAmount ?? 0) - (entry.amountPaid ?? 0);
}

export function buildCarryForwardNote(previousMonth: string, currency: Currency, carryForwardAmount: number, existingNote?: string | null) {
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

export function remittanceStatusFromRow(row: { remittance_paid?: boolean | null; cash_in?: Record<string, unknown> | null }): Status {
  const raw = row.cash_in?.__remittance_status;
  if (raw === "pending" || raw === "partial" || raw === "paid" || raw === "waived") return raw;
  return row.remittance_paid ? "paid" : "pending";
}

// Which group is the remittance-tracked destination — stored inside the existing
// cash_in JSONB column (same pattern as __remittance_status) rather than requiring
// a new due_month_settings column. Defaults to "India" for backward compatibility.
export function remittanceGroupFromRow(row: { cash_in?: Record<string, unknown> | null }): string {
  const raw = row.cash_in?.__remittance_group;
  return typeof raw === "string" && raw.trim() ? raw : "India";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToItem(r: any): DueItem {
  return {
    id: r.id,
    name: r.name,
    group: r.group_name ?? "General",
    dueDay: r.due_date_day ?? null,
    statementDay: r.statement_date ?? null,
    defaultCurrency: (r.default_currency ?? "AED") as Currency,
    defaultAmount: r.default_amount ?? null,
    isFixed: r.is_fixed ?? false,
    isHidden: r.is_hidden ?? false,
    sortOrder: r.sort_order ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToEntry(r: any): DueEntry {
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
    carryForwardAmount: Number(r.carry_forward_amount ?? 0),
    carriedForwardFrom: r.carried_forward_from ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToPayment(r: any): DuePayment {
  return {
    id: r.id,
    dueEntryId: r.due_entry_id,
    paidAmount: Number(r.paid_amount ?? 0),
    paidAt: r.paid_at,
    note: r.note ?? "",
  };
}
