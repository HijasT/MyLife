"use client";

import type { CSSProperties } from "react";
import {
  type Currency,
  type DueEntry,
  type DueItem,
  type Status,
  PARTIAL_REMAINING_COLOR,
  fmtMonthDay,
  getEntryRemaining,
  getMonthlyAmount,
  isSettled,
  statusTone,
  toAed,
} from "@/lib/duetracker";
import type { ThemeVars } from "./theme";
import type { getCycleDates } from "@/lib/duetracker";

type Cycle = ReturnType<typeof getCycleDates>;

export function DueRow({
  V,
  btn,
  inp,
  isDark,
  isMobile,
  isLocked,
  groups,
  item,
  entry,
  amount,
  currency,
  diffAbs,
  diffPct,
  overdue,
  upcoming,
  cycle,
  isEditing,
  isOpeningPayment,
  fxRates,
  onStatusChange,
  onOpenPayment,
  onViewStats,
  onToggleEdit,
  onToggleHide,
  onUpdateEntryField,
  onUpdateItemField,
  onDeleteItem,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  inp: CSSProperties;
  isDark: boolean;
  isMobile: boolean;
  isLocked: boolean;
  groups: string[];
  item: DueItem;
  entry: DueEntry | undefined;
  amount: number;
  currency: Currency;
  diffAbs: number | null;
  diffPct: number | null;
  overdue: boolean;
  upcoming: boolean;
  cycle: Cycle;
  isEditing: boolean;
  isOpeningPayment: boolean;
  fxRates: Record<string, number>;
  onStatusChange: (status: Status) => void;
  onOpenPayment: () => void;
  onViewStats: () => void;
  onToggleEdit: () => void;
  onToggleHide: () => void;
  onUpdateEntryField: (field: "amount" | "currency" | "note", value: number | string | null) => void;
  onUpdateItemField: (field: "name" | "group_name" | "default_currency" | "is_fixed", value: string | boolean) => void;
  onDeleteItem: () => void;
}) {
  const status = entry?.status ?? "pending";
  const tone = statusTone(status);
  const strike = isSettled(status);
  const hasPrevDiff = diffAbs !== null;

  return (
    <div
      style={{
        padding: "11px 16px",
        borderBottom: `1px solid ${V.border}`,
        opacity: item.isHidden ? 0.45 : isOpeningPayment ? 0.65 : 1,
        background: status === "pending" ? "rgba(239,68,68,0.05)" : "transparent",
        borderLeft: status === "pending" ? `3px solid ${V.neg}` : "3px solid transparent",
        transition: "opacity 120ms ease",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <select
          disabled={isLocked || isOpeningPayment}
          value={status}
          onChange={(e) => onStatusChange(e.target.value as Status)}
          style={{ ...inp, width: 110, padding: "6px 8px", fontSize: 12, opacity: isLocked || isOpeningPayment ? 0.6 : 1, cursor: isOpeningPayment ? "wait" : undefined }}
        >
          <option value="pending">Pending</option>
          <option value="waived">Waived</option>
          {(status === "partial" || status === "paid") && <option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>}
        </select>
        {isOpeningPayment && (
          <span
            aria-label="Opening payment form"
            style={{ width: 13, height: 13, marginTop: 8, border: `2px solid ${V.accent}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "duetracker-spin 0.7s linear infinite" }}
          />
        )}

        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, textDecoration: strike ? "line-through" : "none", color: strike ? V.faint : V.text }}>{item.name}</span>
            {item.isFixed && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>Fixed</span>}
            {item.isHidden && <span style={{ fontSize: 10, color: V.faint }}>(hidden)</span>}
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: tone.bg, color: tone.fg }}>{status}</span>
            {overdue && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: V.negSoft, color: V.neg }}>Overdue</span>}
            {!overdue && upcoming && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>Upcoming</span>}
          </div>
          <div style={{ fontSize: 11, color: V.muted, marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            {!isSettled(status) && cycle?.statementDate ? <span style={{ fontWeight: 600, color: "#ef4444" }}>Statement: {fmtMonthDay(cycle.statementDate)}</span> : null}
            {!isSettled(status) && cycle?.dueDate ? <span style={{ fontWeight: 600, color: "#ef4444" }}>Due: {fmtMonthDay(cycle.dueDate)}</span> : null}
            {!isSettled(status) && cycle?.nextDate && cycle.nextLabel ? (
              <span style={{ color: "#ef4444" }}>
                {cycle.daysUntilNext === 0 ? "Today" : `${cycle.daysUntilNext} day${cycle.daysUntilNext === 1 ? "" : "s"}`} for the {cycle.nextLabel === "statement" ? "Statement" : "Due"}: {fmtMonthDay(cycle.nextDate)}
              </span>
            ) : null}
          </div>
          {isEditing ? (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <input defaultValue={entry?.note ?? ""} placeholder="Note for this month…" onBlur={(e) => onUpdateEntryField("note", e.target.value)} style={{ ...inp, fontSize: 12, boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 0 2px", borderTop: `1px dashed ${V.border}`, marginTop: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.06em", width: "100%" }}>Item details</span>
                <input
                  defaultValue={item.name}
                  placeholder="Name"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== item.name) onUpdateItemField("name", v);
                  }}
                  style={{ ...inp, fontSize: 12, flex: "1 1 140px" }}
                />
                <select defaultValue={item.group} onChange={(e) => onUpdateItemField("group_name", e.target.value)} style={{ ...inp, fontSize: 12, width: 100 }}>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <select defaultValue={item.defaultCurrency} onChange={(e) => onUpdateItemField("default_currency", e.target.value)} style={{ ...inp, fontSize: 12, width: 70 }}>
                  <option>AED</option>
                  <option>INR</option>
                  <option>USD</option>
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
                  <input type="checkbox" defaultChecked={item.isFixed} onChange={(e) => onUpdateItemField("is_fixed", e.target.checked)} />
                  Fixed
                </label>
                <button onClick={onDeleteItem} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.neg, marginLeft: "auto" }}>
                  Delete item
                </button>
              </div>
            </div>
          ) : entry?.note ? (
            <div style={{ fontSize: 11, color: V.muted, fontStyle: "italic", marginTop: 3 }}>{entry.note}</div>
          ) : null}
          {entry && entry.amountPaid > 0 && (
            <div style={{ fontSize: 11, color: status === "paid" ? V.pos : status === "partial" ? PARTIAL_REMAINING_COLOR : V.accent, marginTop: 3 }}>
              Paid so far: {currency} {entry.amountPaid.toFixed(2)} · Remaining: {currency} {getEntryRemaining(item, entry).toFixed(2)}
            </div>
          )}
          {hasPrevDiff && (
            <div style={{ fontSize: 11, color: diffAbs === 0 ? V.faint : (diffAbs ?? 0) > 0 ? V.neg : V.pos, marginTop: 4 }}>
              vs last month: {(diffAbs ?? 0) > 0 ? "+" : ""}
              {currency} {(diffAbs ?? 0).toFixed(0)}
              {diffPct !== null ? ` (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%)` : " (new)"}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "space-between" : undefined }}>
          {isEditing ? (
            <>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={getMonthlyAmount(item, entry) || ""}
                placeholder="This month amount"
                onBlur={(e) => onUpdateEntryField("amount", e.target.value ? Number(e.target.value) : null)}
                style={{ ...inp, width: 130, textAlign: "right" }}
              />
              <select defaultValue={currency} onChange={(e) => onUpdateEntryField("currency", e.target.value)} style={{ ...inp, width: 70 }}>
                <option>AED</option>
                <option>INR</option>
                <option>USD</option>
              </select>
            </>
          ) : (
            <div style={{ textAlign: isMobile ? "left" : "right", width: isMobile ? "100%" : undefined }}>
              <div style={{ fontSize: 14, fontWeight: 700, textDecoration: status === "waived" ? "line-through" : "none", color: status === "paid" ? V.pos : status === "partial" ? V.accent : status === "waived" ? V.faint : V.text }}>
                {currency} {amount.toLocaleString()}
              </div>
              {entry && entry.amountPaid > 0 && (
                <div style={{ fontSize: 11, color: status === "paid" ? V.pos : status === "partial" ? PARTIAL_REMAINING_COLOR : V.accent }}>
                  Paid {currency} {entry.amountPaid.toFixed(2)}
                </div>
              )}
              {entry && entry.amountPaid > 0 && (
                <div style={{ fontSize: 11, color: status === "partial" && getEntryRemaining(item, entry) > 0 ? PARTIAL_REMAINING_COLOR : V.faint, fontWeight: status === "partial" && getEntryRemaining(item, entry) > 0 ? 700 : 400 }}>
                  {getEntryRemaining(item, entry) < 0 ? "Credit left" : "Left"} {currency} {getEntryRemaining(item, entry).toFixed(2)}
                </div>
              )}
              {entry?.carryForwardAmount ? (
                <div style={{ fontSize: 11, color: V.warn }}>
                  {entry.carryForwardAmount < 0 ? "Credit carried" : "Carry forward"} {currency} {entry.carryForwardAmount.toFixed(2)}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: V.faint }}>This month {currency} {getMonthlyAmount(item, entry).toFixed(2)}</div>
              {currency !== "AED" && amount > 0 && <div style={{ fontSize: 11, color: V.faint }}>≈ AED {toAed(amount, currency, fxRates).toFixed(0)}</div>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
          <button onClick={onOpenPayment} disabled={isOpeningPayment} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.pos, opacity: isOpeningPayment ? 0.6 : 1, cursor: isOpeningPayment ? "wait" : "pointer" }}>
            {isOpeningPayment ? "Opening…" : "Pay"}
          </button>
          <button onClick={onViewStats} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.accent }}>
            Stats
          </button>
          <button onClick={onToggleEdit} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: isEditing ? V.accent : V.muted }}>
            {isEditing ? "Done" : "Edit"}
          </button>
          <button onClick={onToggleHide} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.faint }}>
            {item.isHidden ? "Show" : "Hide"}
          </button>
        </div>
      </div>
    </div>
  );
}
