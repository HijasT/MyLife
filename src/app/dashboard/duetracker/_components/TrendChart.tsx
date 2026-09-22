"use client";

import type { DueEntry } from "@/lib/duetracker";
import { fmtMonthShort, statusTone } from "@/lib/duetracker";
import type { ThemeVars } from "./theme";

export type ChartPoint = DueEntry & { pct: number; diffAbs: number | null; diffPct: number | null };

export function TrendChart({
  V,
  nativeCurrency,
  avg,
  avgPct,
  points,
}: {
  V: ThemeVars;
  nativeCurrency: string;
  avg: number;
  avgPct: number;
  points: ChartPoint[];
}) {
  return (
    <div style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: V.muted, marginBottom: 10 }}>
        Last {points.length} month{points.length > 1 ? "s" : ""} · Average {nativeCurrency} {avg.toFixed(0)}
      </div>
      <div style={{ position: "relative", height: 180, border: `1px solid ${V.border}`, borderRadius: 12, padding: "12px 8px 28px", overflow: "hidden" }}>
        <svg width="100%" height="140" viewBox={`0 0 ${Math.max(points.length, 1) * 44} 140`} preserveAspectRatio="none">
          <line x1="0" y1={140 - (avgPct / 100) * 120} x2={Math.max(points.length, 1) * 44} y2={140 - (avgPct / 100) * 120} stroke="#ef4444" strokeDasharray="5 5" strokeWidth="2" opacity="0.95" />
          {points.map((point, index) => {
            const x = index * 44 + 22;
            const h = Math.max((point.pct / 100) * 120, 4);
            const y = 140 - h;
            const tone = statusTone(point.status);
            return (
              <g key={point.month}>
                <rect x={x - 12} y={y} width="24" height={h} rx="6" fill={tone.fg} opacity="0.88" />
              </g>
            );
          })}
        </svg>
        <div style={{ position: "absolute", left: 12, right: 12, top: `${12 + (140 - (avgPct / 100) * 120)}px`, borderTop: "1px dashed rgba(245,166,35,0.6)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 12, top: `${4 + (140 - (avgPct / 100) * 120)}px`, fontSize: 10, fontWeight: 800, color: V.accent, background: V.card, padding: "0 4px" }}>AVG</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${points.length}, minmax(0,1fr))`, gap: 6, marginTop: 8 }}>
          {points.map((point) => (
            <div key={point.month} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: V.faint, fontWeight: 700 }}>{fmtMonthShort(point.month)}</div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>
                {point.currency} {(point.amount ?? 0).toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
