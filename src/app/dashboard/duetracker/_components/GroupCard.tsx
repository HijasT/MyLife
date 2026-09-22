"use client";

import type { ReactNode } from "react";
import type { ThemeVars } from "./theme";

export function GroupCard({
  V,
  shadow,
  isDark,
  isMobile,
  group,
  itemCount,
  isCollapsed,
  onToggleCollapse,
  currLabel,
  total,
  paid,
  waived,
  due,
  remittanceSlot,
  children,
}: {
  V: ThemeVars;
  shadow: string;
  isDark: boolean;
  isMobile: boolean;
  group: string;
  itemCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currLabel: string;
  total: number;
  paid: number;
  waived: number;
  due: number;
  remittanceSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden", boxShadow: shadow }}>
      <div
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleCollapse();
          }
        }}
        style={{
          padding: "11px 16px",
          borderBottom: isCollapsed ? undefined : `1px solid ${V.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          flexWrap: isMobile ? "wrap" : "nowrap",
          gap: isMobile ? 6 : 0,
          background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: V.faint, transition: "transform 0.2s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{group}</span>
          <span style={{ fontSize: 11, color: V.faint }}>{itemCount}</span>
        </div>
        <div style={{ display: "flex", gap: isMobile ? 8 : 14, fontSize: 12, color: V.muted, flexWrap: isMobile ? "wrap" : "nowrap", justifyContent: isMobile ? "flex-end" : undefined }} onClick={(e) => e.stopPropagation()}>
          <span>
            Total: <strong style={{ color: V.text }}>{currLabel} {total.toFixed(0)}</strong>
          </span>
          <span style={{ color: V.pos }}>
            Paid: <strong>{currLabel} {paid.toFixed(0)}</strong>
          </span>
          <span style={{ color: "#94a3b8" }}>
            Waived: <strong>{currLabel} {waived.toFixed(0)}</strong>
          </span>
          <span style={{ color: due < 0 ? V.pos : V.neg }}>
            Due: <strong>{currLabel} {due.toFixed(0)}</strong>
          </span>
        </div>
      </div>

      {!isCollapsed && remittanceSlot}
      {!isCollapsed && children}
    </div>
  );
}
