"use client";

import type { CSSProperties } from "react";
import { type Currency, type Status, fmtMonth } from "@/lib/duetracker";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

export function AddMonthModal({
  V,
  btn,
  btnP,
  inp,
  defaultAmount,
  newMonth,
  newAmount,
  newCurrency,
  newNote,
  newStatus,
  carryForwardPreview,
  missing,
  onClose,
  onSave,
  onMonthChange,
  onAmountChange,
  onCurrencyChange,
  onNoteChange,
  onStatusChange,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  defaultAmount: number;
  newMonth: string;
  newAmount: string;
  newCurrency: Currency;
  newNote: string;
  newStatus: Status;
  carryForwardPreview: { previousMonth: string; carryForwardAmount: number; baseAmount: number } | null;
  missing: string[];
  onClose: () => void;
  onSave: () => void;
  onMonthChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onCurrencyChange: (v: Currency) => void;
  onNoteChange: (v: string) => void;
  onStatusChange: (v: Status) => void;
}) {
  return (
    <Modal
      V={V}
      btn={btn}
      title="Add month record"
      onClose={onClose}
      width={500}
      footer={
        <>
          <button style={btn} onClick={onClose}>
            Cancel
          </button>
          <button style={btnP} onClick={onSave}>
            Save
          </button>
        </>
      }
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Month
        <input type="month" style={inp} value={newMonth} onChange={(e) => onMonthChange(e.target.value)} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 84px 110px", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Amount
          <input type="text" inputMode="decimal" style={inp} value={newAmount} onChange={(e) => onAmountChange(e.target.value)} placeholder={`Default: ${defaultAmount}`} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Cur
          <select style={inp} value={newCurrency} onChange={(e) => onCurrencyChange(e.target.value as Currency)}>
            <option>AED</option>
            <option>INR</option>
            <option>USD</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Status
          <select style={inp} value={newStatus} onChange={(e) => onStatusChange(e.target.value as Status)}>
            <option value="pending">Pending</option>
            <option value="waived">Waived</option>
          </select>
        </label>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Note
        <input style={inp} value={newNote} onChange={(e) => onNoteChange(e.target.value)} />
      </label>
      {carryForwardPreview && (
        <div style={{ fontSize: 12, color: V.muted, background: "rgba(245,166,35,0.08)", border: `1px solid ${V.border}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontWeight: 800, color: V.text, marginBottom: 4 }}>Carry forward preview</div>
          <div>
            This month amount: {newCurrency} {carryForwardPreview.baseAmount.toFixed(2)}
          </div>
          <div>
            Carry forward from {fmtMonth(carryForwardPreview.previousMonth)}: {newCurrency} {carryForwardPreview.carryForwardAmount.toFixed(2)}
          </div>
          <div style={{ marginTop: 4, color: V.accent, fontWeight: 800 }}>
            New total due: {newCurrency} {(carryForwardPreview.baseAmount + carryForwardPreview.carryForwardAmount).toFixed(2)}
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <div style={{ fontSize: 12, color: V.faint }}>
          Missing:{" "}
          {missing.slice(0, 6).map((m) => (
            <button key={m} onClick={() => onMonthChange(m)} style={{ ...btn, padding: "2px 8px", fontSize: 11, marginLeft: 4, color: newMonth === m ? V.accent : V.muted }}>
              {m}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
