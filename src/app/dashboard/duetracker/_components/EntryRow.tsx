"use client";

import type { CSSProperties } from "react";
import {
  type Currency,
  type DueEntry,
  type DuePayment,
  type Status,
  PARTIAL_REMAINING_COLOR,
  fmtDateTime,
  fmtMonth,
  getEntryRemaining,
  getTotalDue,
  statusTone,
} from "@/lib/duetracker";
import type { ThemeVars } from "./theme";

export function EntryRow({
  V,
  btn,
  inp,
  isDark,
  isMobile,
  entry,
  diffAbs,
  diffPct,
  aed,
  timezone,
  isLocked,
  isEditing,
  editAmount,
  editCurrency,
  editNote,
  editStatus,
  payments,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditAmountChange,
  onEditCurrencyChange,
  onEditNoteChange,
  onEditStatusChange,
  onStatusChange,
  onOpenPayment,
  onDeletePayment,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  inp: CSSProperties;
  isDark: boolean;
  isMobile: boolean;
  entry: DueEntry;
  diffAbs: number | null;
  diffPct: number | null;
  aed: number;
  timezone: string;
  isLocked: boolean;
  isEditing: boolean;
  editAmount: string;
  editCurrency: Currency;
  editNote: string;
  editStatus: Status;
  payments: DuePayment[];
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditAmountChange: (v: string) => void;
  onEditCurrencyChange: (v: Currency) => void;
  onEditNoteChange: (v: string) => void;
  onEditStatusChange: (v: Status) => void;
  onStatusChange: (status: Status) => void;
  onOpenPayment: () => void;
  onDeletePayment: (paymentId: string) => void;
}) {
  const tone = statusTone(entry.status);
  const strike = entry.status === "paid" || entry.status === "waived";
  const totalDue = getTotalDue({ defaultAmount: null }, entry);
  const remaining = getEntryRemaining({ defaultAmount: null }, entry);
  const progressPct = entry.amountPaid > 0 && totalDue > 0 ? Math.min(100, Math.round((entry.amountPaid / totalDue) * 100)) : null;

  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}` }}>
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMonth(entry.month)}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 84px 110px", gap: 8 }}>
            <input type="text" inputMode="decimal" style={inp} value={editAmount} onChange={(e) => onEditAmountChange(e.target.value)} placeholder="This month amount" />
            <select style={inp} value={editCurrency} onChange={(e) => onEditCurrencyChange(e.target.value as Currency)}>
              <option>AED</option>
              <option>INR</option>
              <option>USD</option>
            </select>
            <select disabled={isLocked} style={inp} value={editStatus} onChange={(e) => onEditStatusChange(e.target.value as Status)}>
              <option value="pending">Pending</option>
              <option value="partial" disabled>
                Partial (from payments)
              </option>
              <option value="paid" disabled>
                Paid (from payments)
              </option>
              <option value="waived">Waived</option>
            </select>
          </div>
          <input style={inp} value={editNote} onChange={(e) => onEditNoteChange(e.target.value)} placeholder="Note (optional)" />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btn, background: V.accent, border: "none", color: "#fff", fontWeight: 700 }} onClick={onSaveEdit}>
              Save
            </button>
            <button style={btn} onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <select value={entry.status} onChange={(e) => onStatusChange(e.target.value as Status)} style={{ ...inp, width: 110, padding: "5px 8px", fontSize: 12 }}>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="waived">Waived</option>
            </select>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMonth(entry.month)}</div>
              {entry.note && <div style={{ fontSize: 11, color: V.muted, fontStyle: "italic", marginTop: 2, whiteSpace: "pre-line" }}>{entry.note}</div>}
              {entry.carryForwardAmount !== 0 && (
                <div style={{ fontSize: 11, color: V.warn, marginTop: 2 }}>
                  {entry.carryForwardAmount < 0 ? "Credit carried" : "Carry forward"}: {entry.currency} {entry.carryForwardAmount.toFixed(2)} · This month amount: {entry.currency} {(entry.amount ?? 0).toFixed(2)}
                </div>
              )}
              {entry.amountPaid > 0 && (
                <div style={{ fontSize: 11, color: entry.status === "paid" ? V.pos : entry.status === "partial" ? PARTIAL_REMAINING_COLOR : V.accent, marginTop: 2 }}>
                  Paid so far: {entry.currency} {entry.amountPaid.toFixed(2)} · Remaining: {entry.currency} {remaining.toFixed(2)}
                  {entry.lastPaidAt ? ` · Last: ${fmtDateTime(entry.lastPaidAt, timezone)}` : ""}
                </div>
              )}
              {progressPct !== null && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progressPct}%`, background: progressPct >= 100 ? V.pos : "linear-gradient(90deg,var(--negative) 0%,var(--warning) 100%)", borderRadius: 999, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: progressPct >= 100 ? V.pos : V.accent, minWidth: 34, textAlign: "right" }}>{progressPct}%</span>
                </div>
              )}
              {diffAbs !== null && (
                <div style={{ fontSize: 11, color: diffAbs === 0 ? V.faint : diffAbs > 0 ? V.neg : V.pos, marginTop: 4 }}>
                  vs previous: {diffAbs > 0 ? "+" : ""}
                  {entry.currency} {diffAbs.toFixed(0)} {diffPct !== null ? `(${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%)` : "(new)"}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "space-between" : undefined }}>
            <div style={{ textAlign: isMobile ? "left" : "right", width: isMobile ? "100%" : undefined }}>
              <div style={{ fontSize: 14, fontWeight: 700, textDecoration: entry.status === "waived" ? "line-through" : "none", color: strike ? V.faint : V.text }}>
                {entry.currency} {totalDue.toLocaleString()}
              </div>
              {entry.carryForwardAmount !== 0 && (
                <div style={{ fontSize: 11, color: entry.carryForwardAmount < 0 ? V.pos : V.warn }}>
                  {entry.carryForwardAmount < 0 ? "Credit" : "Carry fwd"} {entry.currency} {entry.carryForwardAmount.toFixed(2)}
                </div>
              )}
              {(entry.amountPaid > 0 || entry.carryForwardAmount !== 0) && (
                <div style={{ fontSize: 11, color: V.faint }}>
                  This month amount {entry.currency} {(entry.amount ?? 0).toFixed(2)}
                </div>
              )}
              {entry.currency !== "AED" && entry.amount !== null && <div style={{ fontSize: 11, color: V.faint }}>≈ AED {aed.toFixed(0)}</div>}
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, display: "inline-block", marginTop: 3, background: tone.bg, color: tone.fg }}>{entry.status}</span>
            </div>
            <button style={{ ...btn, color: V.pos }} onClick={onOpenPayment} disabled={isLocked}>
              Add payment
            </button>
            <button style={btn} onClick={onStartEdit}>
              Edit
            </button>
          </div>
        </div>
      )}
      {!isEditing && payments.length > 0 ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${V.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, marginBottom: 8 }}>Payment history</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {payments.map((payment) => (
              <div key={payment.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 12, color: V.muted, flexWrap: "wrap" }}>
                <span>
                  <strong style={{ color: V.text }}>
                    {entry.currency} {payment.paidAmount.toFixed(2)}
                  </strong>
                  {payment.note ? ` · ${payment.note}` : ""}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{fmtDateTime(payment.paidAt, timezone)}</span>
                  <button
                    onClick={() => onDeletePayment(payment.id)}
                    disabled={isLocked}
                    style={{ background: "none", border: "none", color: V.faint, cursor: isLocked ? "not-allowed" : "pointer", padding: "2px 6px", fontSize: 13, opacity: isLocked ? 0.3 : 0.7, borderRadius: 6 }}
                    title="Delete payment"
                    aria-label="Delete payment"
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
