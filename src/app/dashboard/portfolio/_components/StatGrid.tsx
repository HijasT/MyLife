"use client";

import type { ReactNode } from "react";
import type { ThemeVars } from "./theme";

export type StatCardData = {
  label: string;
  value: ReactNode;
  color?: string;
};

export function StatGrid({ V, cards, minWidth = 155 }: { V: ThemeVars; cards: StatCardData[]; minWidth?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${minWidth}px,1fr))`, gap: 10 }}>
      {cards.map((card) => (
        <div key={card.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: V.shadow }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{card.label}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: card.color ?? V.text }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}
