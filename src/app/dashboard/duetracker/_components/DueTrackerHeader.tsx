"use client";

import type { CSSProperties } from "react";
import type { ThemeVars } from "./theme";

export function DueTrackerHeader({
  V,
  btn,
  btnP,
  monthLabel,
  isLocked,
  showHidden,
  onToggleLock,
  onToggleShowHidden,
  onOpenSettings,
  onOpenAddItem,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  monthLabel: string;
  isLocked: boolean;
  showHidden: boolean;
  onToggleLock: () => void;
  onToggleShowHidden: () => void;
  onOpenSettings: () => void;
  onOpenAddItem: () => void;
}) {
  return (
    <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, color: V.accent, fontWeight: 700, letterSpacing: "0.04em" }}>DUE TRACKER</div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{monthLabel}</div>
        <div style={{ fontSize: 13, color: V.faint, marginTop: 4 }}>Recurring payments &amp; status</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button style={btn} onClick={onToggleShowHidden}>
          {showHidden ? "Hide hidden" : "Show hidden"}
        </button>
        <button style={btn} onClick={onOpenSettings}>
          Settings
        </button>
        <button style={isLocked ? btnP : btn} onClick={onToggleLock}>
          {isLocked ? "Unlock month" : "Lock month"}
        </button>
        <button style={btnP} onClick={onOpenAddItem}>
          + Add due
        </button>
      </div>
    </div>
  );
}
