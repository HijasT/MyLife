"use client";

import type { ReactNode } from "react";
import type { ThemeVars } from "./theme";

export type StatCardData = {
  label: string;
  value: ReactNode;
  color?: string;
  note?: string;
};

export function StatGrid({ V, shadow, cards }: { V: ThemeVars; shadow: string; cards: StatCardData[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
      {cards.map((card) => (
        <div key={card.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, padding: "14px 16px", boxShadow: shadow }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>{card.label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: card.color ?? V.text, marginTop: 4, lineHeight: 1.15 }}>{card.value}</div>
          {card.note && <div style={{ fontSize: 10, color: V.faint, marginTop: 3 }}>{card.note}</div>}
        </div>
      ))}
    </div>
  );
}
