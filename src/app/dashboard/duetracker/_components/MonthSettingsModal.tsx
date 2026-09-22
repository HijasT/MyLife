"use client";

import type { CSSProperties } from "react";
import type { MonthSettings } from "@/lib/duetracker";
import { fmtMonth } from "@/lib/duetracker";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

export function MonthSettingsModal({
  V,
  btn,
  btnP,
  inp,
  isDark,
  month,
  settings,
  fxRateDrafts,
  newGroupName,
  onClose,
  onSave,
  onFxDraftChange,
  onNewGroupNameChange,
  onAddGroup,
  onRemittanceGroupChange,
  onNoteChange,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  isDark: boolean;
  month: string;
  settings: MonthSettings;
  fxRateDrafts: Record<string, string>;
  newGroupName: string;
  onClose: () => void;
  onSave: () => void;
  onFxDraftChange: (currency: string, value: string) => void;
  onNewGroupNameChange: (value: string) => void;
  onAddGroup: () => void;
  onRemittanceGroupChange: (group: string) => void;
  onNoteChange: (note: string) => void;
}) {
  return (
    <Modal
      V={V}
      btn={btn}
      title="Month settings"
      subtitle={fmtMonth(month)}
      onClose={onClose}
      width={560}
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
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Exchange rates</div>
        {(["INR", "USD"] as const).map((cur) => (
          <div key={cur} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, width: 40 }}>{cur}:</span>
            <span style={{ fontSize: 13, color: V.faint }}>1 AED =</span>
            <input type="text" inputMode="decimal" style={{ ...inp, width: 90 }} value={fxRateDrafts[cur] ?? String(settings.fxRates[cur] ?? "")} onChange={(e) => onFxDraftChange(cur, e.target.value)} />
            <span style={{ fontSize: 13, color: V.faint }}>{cur}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Groups</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {settings.groups.map((g) => (
            <span key={g} style={{ padding: "4px 12px", borderRadius: 999, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", fontSize: 12, fontWeight: 600 }}>
              {g}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inp, flex: 1 }} placeholder="Add new group…" value={newGroupName} onChange={(e) => onNewGroupNameChange(e.target.value)} />
          <button style={btnP} onClick={onAddGroup}>
            Add
          </button>
        </div>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Remittance-tracked group
        <select style={inp} value={settings.remittanceGroup} onChange={(e) => onRemittanceGroupChange(e.target.value)}>
          {settings.groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: V.faint, textTransform: "none", fontWeight: 400 }}>Which group represents money sent via remittance (its total is compared against the amount remitted).</span>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Month note
        <textarea style={{ ...inp, resize: "vertical", minHeight: 70 }} value={settings.note} onChange={(e) => onNoteChange(e.target.value)} placeholder="Any notes for this month…" />
      </label>
    </Modal>
  );
}
