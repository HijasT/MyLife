"use client";

import type { CSSProperties } from "react";
import type { Status } from "@/lib/duetracker";
import { isPaid, statusTone } from "@/lib/duetracker";
import type { ThemeVars } from "./theme";

export function RemittanceWidget({
  V,
  inp,
  btn,
  isDark,
  isLocked,
  status,
  editMode,
  inrDraft,
  rateDraft,
  remittanceAed,
  indiaTotalInr,
  diffInr,
  diffAed,
  onStatusChange,
  onInrDraftChange,
  onRateDraftChange,
  onEditOrSave,
  onViewHistory,
}: {
  V: ThemeVars;
  inp: CSSProperties;
  btn: CSSProperties;
  isDark: boolean;
  isLocked: boolean;
  status: Status;
  editMode: boolean;
  inrDraft: string;
  rateDraft: string;
  remittanceAed: number;
  indiaTotalInr: number;
  diffInr: number;
  diffAed: number;
  onStatusChange: (status: Status) => void;
  onInrDraftChange: (value: string) => void;
  onRateDraftChange: (value: string) => void;
  onEditOrSave: () => void;
  onViewHistory: () => void;
}) {
  const tone = statusTone(status);
  const settledLook = isPaid(status) || status === "waived";

  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}`, background: isDark ? "rgba(239,68,68,0.04)" : "rgba(239,68,68,0.02)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onViewHistory} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 700, color: settledLook ? V.faint : V.text, textDecoration: settledLook ? "line-through" : "none" }}>
              Remittance
            </button>
            <select
              disabled={isLocked}
              value={status}
              onChange={(e) => onStatusChange(e.target.value as Status)}
              style={{ ...inp, padding: "4px 8px", fontSize: 11, minWidth: 110, background: tone.bg, color: tone.fg, opacity: isLocked ? 0.6 : 1 }}
            >
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="waived">Waived</option>
            </select>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(239,68,68,0.12)", color: V.accent }}>Manual</span>
          </div>
          {editMode && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input disabled={isLocked} type="text" inputMode="decimal" style={{ ...inp, width: 120, padding: "5px 8px", fontSize: 12 }} value={inrDraft} onChange={(e) => onInrDraftChange(e.target.value)} placeholder="INR amount" />
              <span style={{ fontSize: 11, color: V.faint }}>÷</span>
              <input disabled={isLocked} type="text" inputMode="decimal" style={{ ...inp, width: 90, padding: "5px 8px", fontSize: 12 }} value={rateDraft} onChange={(e) => onRateDraftChange(e.target.value)} placeholder="Rate" />
              <span style={{ fontSize: 11, color: V.faint }}>AED {remittanceAed.toFixed(0)}</span>
            </div>
          )}
          <div style={{ fontSize: 11, color: V.faint, marginTop: 5 }}>
            India subtotal: INR {indiaTotalInr.toFixed(0)} · Variance: {diffInr === 0 ? "0" : `${diffInr > 0 ? "+" : ""}${diffInr.toFixed(0)} INR`} ({diffAed > 0 ? "+" : ""}AED {diffAed.toFixed(0)})
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: remittanceAed > 0 ? V.accent : V.faint, textDecoration: status === "waived" ? "line-through" : "none" }}>AED {remittanceAed.toFixed(0)}</span>
          <button onClick={onViewHistory} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: V.accent }}>
            History
          </button>
          <button disabled={isLocked} onClick={onEditOrSave} style={{ ...btn, padding: "4px 9px", fontSize: 11, color: editMode ? V.accent : V.muted, opacity: isLocked ? 0.6 : 1 }}>
            {editMode ? "Save" : "Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}
