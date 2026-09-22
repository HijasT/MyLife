"use client";

import { fmtN, fmtSignedAed } from "@/lib/portfolio";
import type { BrokerStat } from "@/lib/portfolio";
import type { ThemeVars } from "./theme";

export function BrokerTable({
  V,
  isDark,
  isMobile,
  brokerStats,
}: {
  V: ThemeVars;
  isDark: boolean;
  isMobile: boolean;
  brokerStats: Record<string, BrokerStat>;
}) {
  if (Object.keys(brokerStats).length === 0) return null;

  const rows = Object.entries(brokerStats)
    .map(([key, b]) => ({
      key,
      name: b.label,
      ...b,
      investedAed: b.totalBoughtAed - b.totalSoldAed,
      pl: b.currentValueAed - b.remainingCostBasisAed,
    }))
    .sort((a, b) => b.remainingCostBasisAed - a.remainingCostBasisAed);

  const anyUnknownPrice = rows.some((r) => r.hasUnknownPrice);

  return (
    <div style={{ padding: "16px 24px 0" }}>
      <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, overflow: "hidden", boxShadow: V.shadow }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: V.faint, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
          By broker / platform
        </div>

        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1fr", gap: 8, padding: "8px 16px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: V.faint, borderBottom: `1px solid ${V.border}` }}>
            <div>Broker</div>
            <div>Total invested</div>
            <div>Total sold</div>
            <div>Current investment</div>
            <div>P&amp;L</div>
          </div>
        )}

        {rows.map((row) => {
          const up = row.pl >= 0;
          const plNode = (
            <>
              {fmtSignedAed(row.pl)}
              {row.hasUnknownPrice && <span style={{ color: V.faint, fontWeight: 400 }}> *</span>}
            </>
          );
          if (isMobile) {
            return (
              <div key={row.key} style={{ padding: "12px 16px", borderBottom: `1px solid ${V.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{row.name}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: up ? V.pos : V.neg }}>{plNode}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 11, color: V.muted }}>
                  <div>
                    Invested
                    <br />
                    <strong style={{ color: V.text, fontSize: 12 }}>AED {fmtN(row.totalBoughtAed)}</strong>
                  </div>
                  <div>
                    Sold
                    <br />
                    <strong style={{ color: V.text, fontSize: 12 }}>AED {fmtN(row.totalSoldAed)}</strong>
                  </div>
                  <div>
                    Current
                    <br />
                    <strong style={{ color: V.text, fontSize: 12 }}>AED {fmtN(row.investedAed)}</strong>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1fr", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${V.border}`, fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>{row.name}</div>
              <div style={{ color: V.muted }}>AED {fmtN(row.totalBoughtAed)}</div>
              <div style={{ color: V.muted }}>AED {fmtN(row.totalSoldAed)}</div>
              <div>AED {fmtN(row.investedAed)}</div>
              <div style={{ fontWeight: 700, color: up ? V.pos : V.neg }}>{plNode}</div>
            </div>
          );
        })}

        {anyUnknownPrice && <div style={{ padding: "6px 16px 10px", fontSize: 10, color: V.faint }}>* P&amp;L excludes assets without a current price set</div>}
      </div>
    </div>
  );
}
